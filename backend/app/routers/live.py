"""Read-only aggregator for the /live page's player popover.

Right now we collect three slices in one round trip so the popover can
render history + linked-forum-profile + currently-active jbf_uaio
effects without the client doing N HTTP calls:

  * `active_effects` — non-expired rows from `cs_active_effects` for the
    given steamid.
  * `recent_actions` — last N audit rows from `cs_rcon_log` whose
    `command` mentions either the nickname (after `-n` flag) OR the
    steamid (the bot-cast bridge can include it).
  * `forum_user` — the forum account linked to this steamid via the
    optional `users.steam_id` column, if any.

Staff-only — the same gate as the rest of /cs-rcon/*.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, or_, select

from app.core.deps import CurrentUser, DbSession, get_current_user
from app.models.cs_active_effect import CsActiveEffect
from app.models.cs_rcon_log import CsRconLog
from app.models.user import User
from app.schemas.cs_rcon import (
    SpecTeleportRequest,
    SpecTeleportResult,
    ActiveEffectRead,
    RconLogRead,
    SpecFollowRequest,
    SpecFollowResult,
)
from app.schemas.user import RoleRead, UserPublic
from app.services import auth as auth_service
from app.services import cs_rcon

router = APIRouter(prefix="/live", tags=["live"])


async def _is_staff(db, user: User) -> bool:
    roles = await auth_service.get_user_roles(db, user.id)
    return any(getattr(r, "is_staff", False) for r in roles)


@router.get("/player-detail")
async def player_detail(
    user: CurrentUser,
    db: DbSession,
    steamid: str = Query(min_length=1, max_length=64),
    nick: str | None = Query(default=None, max_length=64),
    history_limit: int = Query(default=10, ge=1, le=50),
) -> dict[str, Any]:
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )

    # --- Active jbf_uaio effects -----------------------------------------
    now = datetime.now(UTC)
    effects_q = await db.execute(
        select(CsActiveEffect).where(
            CsActiveEffect.steamid == steamid,
            (CsActiveEffect.expires_at.is_(None))
            | (CsActiveEffect.expires_at > now),
        )
    )
    effects = list(effects_q.scalars().all())

    # Resolve granted_by nicknames so the UI can label them.
    grantor_ids = {e.granted_by_id for e in effects if e.granted_by_id is not None}
    grantor_nicks: dict[int, str] = {}
    if grantor_ids:
        gres = await db.execute(
            select(User.id, User.nickname).where(User.id.in_(grantor_ids))
        )
        grantor_nicks = {uid: nn for uid, nn in gres.all()}

    active_effects = []
    for e in effects:
        row = ActiveEffectRead.model_validate(e)
        if e.granted_by_id is not None:
            row.granted_by_nickname = grantor_nicks.get(e.granted_by_id)
        active_effects.append(row.model_dump(mode="json"))

    # --- Recent admin actions targeting this player ----------------------
    # `command` is the only free-text field that captures the target;
    # jbf_uaio commands typically include `-n <nick>` so we ILIKE on
    # either the nickname or the steamid (the bot-cast variant).
    clauses = []
    if nick:
        clauses.append(CsRconLog.command.ilike(f"%-n {nick}%"))
        clauses.append(CsRconLog.command.ilike(f"%-p \"{nick}\"%"))
    clauses.append(CsRconLog.command.ilike(f"%{steamid}%"))

    log_q = await db.execute(
        select(CsRconLog)
        .where(or_(*clauses))
        .order_by(desc(CsRconLog.id))
        .limit(history_limit)
    )
    log_rows = list(log_q.scalars().all())
    actor_ids = {r.actor_id for r in log_rows if r.actor_id is not None}
    actor_nicks: dict[int, str] = {}
    if actor_ids:
        ares = await db.execute(
            select(User.id, User.nickname).where(User.id.in_(actor_ids))
        )
        actor_nicks = {uid: nn for uid, nn in ares.all()}
    recent_actions = []
    for r in log_rows:
        item = RconLogRead.model_validate(r)
        if r.actor_id is not None:
            item.actor_nickname = actor_nicks.get(r.actor_id)
        recent_actions.append(item.model_dump(mode="json"))

    # --- Linked forum user -----------------------------------------------
    forum_user_data: dict[str, Any] | None = None
    fres = await db.execute(select(User).where(User.steam_id == steamid))
    forum_user = fres.scalar_one_or_none()
    if forum_user is not None:
        roles = await auth_service.get_user_roles(db, forum_user.id)
        public = UserPublic(
            id=forum_user.id,
            nickname=forum_user.nickname,
            avatar_url=forum_user.avatar_url,
            title=forum_user.title,
            bio=forum_user.bio,
            is_active=forum_user.is_active,
            last_seen_at=forum_user.last_seen_at,
            created_at=forum_user.created_at,
            roles=[RoleRead.model_validate(r) for r in roles],
            total_posts=forum_user.total_posts,
            total_reactions_received=forum_user.total_reactions_received,
            thanks_received=forum_user.thanks_received,
            granted_perks=list(forum_user.granted_perks or []),
            birthday=forum_user.birthday.isoformat() if forum_user.birthday else None,
            steam_id=forum_user.steam_id,
            bonus_xp=forum_user.bonus_xp,
            case_keys=forum_user.case_keys,
            nick_color=forum_user.nick_color,
            avatar_glow_color=forum_user.avatar_glow_color,
        )
        forum_user_data = public.model_dump(mode="json")

    return {
        "steamid": steamid,
        "active_effects": active_effects,
        "recent_actions": recent_actions,
        "forum_user": forum_user_data,
    }


@router.post("/spec/follow", response_model=SpecFollowResult)
async def spec_follow(
    payload: SpecFollowRequest,
    user: CurrentUser,
    db: DbSession,
) -> SpecFollowResult:
    """Lock the headless forum spectator's camera onto target_userid.

    Sends `forum_spec_follow <userid>` to the game server via RCON; the
    jbf_forum_spectator AMX plugin (v0.3+) intercepts that and relays
    `spec_player #<userid>` to the spectator client over the
    server-to-client engine cmd channel.

    Passing target_userid=0 releases the lock → autodirector resumes.
    """
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )

    cmd = f"forum_spec_follow {int(payload.target_userid)}"
    try:
        result = await cs_rcon.execute(cmd, timeout=4.0)
    except cs_rcon.RconError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"RCON: {e}"
        )
    return SpecFollowResult(
        ok=True,
        target_userid=payload.target_userid,
        latency_ms=result.latency_ms,
    )


@router.post("/spec/teleport", response_model=SpecTeleportResult)
async def spec_teleport(
    payload: SpecTeleportRequest,
    user: CurrentUser,
    db: DbSession,
) -> SpecTeleportResult:
    """Free-roam pilot: warp the headless spectator to (x, y, [z]).

    Fires `forum_spec_teleport <x> <y> [z]` via RCON. The
    jbf_forum_spectator AMX plugin (v0.7+) sets pev_origin directly on
    the spec player entity and parks them in spec_mode 3 (free-roam),
    so the camera stays at the requested point until the operator
    follows someone or releases.
    """
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )

    if payload.z is None:
        cmd = f"forum_spec_teleport {payload.x:.1f} {payload.y:.1f}"
    else:
        cmd = f"forum_spec_teleport {payload.x:.1f} {payload.y:.1f} {payload.z:.1f}"
    try:
        result = await cs_rcon.execute(cmd, timeout=4.0)
    except cs_rcon.RconError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"RCON: {e}"
        )
    return SpecTeleportResult(
        ok=True,
        x=payload.x,
        y=payload.y,
        z=payload.z,
        latency_ms=result.latency_ms,
    )


# -----------------------------------------------------------------------------
# Phase C — WASD pilot WebSocket
#
# Bidirectional control channel between the /live admin panel and the
# headless xash3d spectator. The frontend captures keys + mouse on the
# /live canvas, batches them, and ships JSON events. We forward each
# event over a TCP line-protocol to the host-side input-server
# (/opt/cs-stream/spectator/input-server.py), which converts them to
# xdotool calls against the Xvfb display.
#
# Endpoint: ws://.../live/spec/control/ws
#
# Auth: same JWT-in-cookie pattern as /shoutbox/ws. Staff-only —
# resolved via the user.roles[*].is_staff flag.
#
# Wire format (one JSON per WebSocket text message, OR newline-delimited
# inside batched message):
#   {"t":"kd","k":"w"}      keydown w
#   {"t":"ku","k":"w"}      keyup w
#   {"t":"mm","dx":4,"dy":-2}   relative mouse motion
#   {"t":"click","b":1}     mouse button click
#   {"t":"ping"}            liveness
#
# When the WS opens we also force the spectator into free-roam mode via
# `forum_spec_freeroam` so WASD actually moves the camera. When the WS
# closes we release back to autodirector via `forum_spec_release`.
# -----------------------------------------------------------------------------

import asyncio as _asyncio
import json as _json
import socket as _socket
from typing import Annotated as _Annotated

from fastapi import Cookie, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession as _AsyncSession

from app.core.database import get_db as _get_db
from app.core.deps import COOKIE_NAME as _COOKIE_NAME
from app.core.security import decode_token as _decode_token

INPUT_SERVER_HOST = "172.20.0.1"
INPUT_SERVER_PORT = 7777


@router.websocket("/spec/control/ws")
async def spec_control_ws(
    ws: WebSocket,
    db: _Annotated[_AsyncSession, Depends(_get_db)],
    session_cookie: _Annotated[str | None, Cookie(alias=_COOKIE_NAME)] = None,
    token_qs: _Annotated[str | None, Query(alias="token")] = None,
) -> None:
    """Pilot the headless spectator via WASD + mouselook from /live."""
    # ---- staff auth via JWT in cookie ----
    user_id: int | None = None
    token = session_cookie or token_qs
    if token:
        payload = _decode_token(token)
        if payload and payload.get("type") in {"access", "refresh"}:
            try:
                user_id = int(payload.get("sub") or 0) or None
            except (TypeError, ValueError):
                user_id = None
    if user_id is None:
        await ws.close(code=4401, reason="unauthenticated")
        return
    # Use the same helper the HTTP endpoints use (User has no direct
    # `roles` relationship — roles live in user_roles join table and
    # auth_service.get_user_roles resolves them via UserRole + Role).
    is_staff = False
    try:
        roles = await auth_service.get_user_roles(db, user_id)
        if any(getattr(r, "is_staff", False) for r in roles):
            is_staff = True
    except Exception:
        pass
    if not is_staff:
        await ws.close(code=4403, reason="staff only")
        return

    await ws.accept()

    # 1. Switch spec into free-roam mode so WASD actually moves the cam.
    try:
        await cs_rcon.execute("forum_spec_freeroam", timeout=3.0)
    except Exception:
        pass

    # 2. Open a single TCP connection to the host-side input server.
    sock: _socket.socket | None = None
    loop = _asyncio.get_running_loop()
    try:
        sock = await loop.run_in_executor(None, _connect_input_server)
    except Exception as e:
        await ws.send_text(_json.dumps({"t": "error", "msg": f"input-server: {e}"}))
        await ws.close(code=5002, reason="input-server unreachable")
        return

    await ws.send_text(_json.dumps({"t": "ready"}))
    try:
        while True:
            raw = await ws.receive_text()
            # Accept either single-event or newline-batched events.
            for line in raw.split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    evt = _json.loads(line)
                except Exception:
                    continue
                if not isinstance(evt, dict) or "t" not in evt:
                    continue
                payload = (_json.dumps(evt) + "\n").encode("utf-8")
                try:
                    await loop.run_in_executor(None, sock.sendall, payload)
                except OSError:
                    # Reconnect once on socket death.
                    try:
                        sock.close()
                    except Exception:
                        pass
                    try:
                        sock = await loop.run_in_executor(
                            None, _connect_input_server,
                        )
                        await loop.run_in_executor(None, sock.sendall, payload)
                    except Exception:
                        await ws.close(code=5002, reason="input-server lost")
                        return
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass
        # Release spec back to autodirector when the pilot disconnects.
        try:
            await cs_rcon.execute("forum_spec_follow 0", timeout=3.0)
        except Exception:
            pass


def _connect_input_server() -> _socket.socket:
    s = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
    s.settimeout(3.0)
    s.connect((INPUT_SERVER_HOST, INPUT_SERVER_PORT))
    s.settimeout(None)
    return s
