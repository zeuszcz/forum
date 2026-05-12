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
