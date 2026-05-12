"""POST /cs-rcon/execute — staff-gated RCON gateway to the CS 1.6 server.

Security layers (each must pass):
  1. is_staff on the forum (auth_service.get_user_roles)
  2. Whitelist — command must start with `jbf_uaio_`
  3. Reject -g Aim (no admin POV through RCON)
  4. Sanitize — no quote/semicolon/control chars (RCON injection)
  5. Rate limit — 5 commands per 10 s per user, in-process counter
  6. Audit — every call logged to cs_rcon_log, success or fail

Per-user audit also lets `/admin/cs-rcon/log` show who triggered what,
since in-game logs only see `Console` as the actor for RCON-issued
commands.
"""
from __future__ import annotations

import asyncio
import re
import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select

from app.core.deps import CurrentUser, DbSession, get_current_user
from app.models.cs_rcon_log import CsRconLog
from app.models.user import User
from app.schemas.cs_rcon import (
    ActionRequest,
    ActionResult,
    ActiveEffectRead,
    CsPlayersResponse,
    RconBatch,
    RconCommand,
    RconLogRead,
    RconResult,
    PrivateSayRequest,
    PrivateSayResult,
    SayRequest,
    SayResult,
)
from app.services import auth as auth_service
from app.services import cs_effects, cs_rcon

router = APIRouter(prefix="/cs-rcon", tags=["cs-rcon"])

# Whitelist: only commands the jbf_uaio_modular plugin exposes.
_ALLOWED_PREFIX = "jbf_uaio_"
# Characters that would terminate / re-quote / break the RCON payload.
_FORBIDDEN_CHARS = set('";\n\r\x00`$')
# `-g Aim` doesn't work via RCON — no admin POV. Catch both Aim and aim.
_AIM_RE = re.compile(r"\-g\s+aim\b", re.IGNORECASE)

# Rate limit: 5 commands per 10 s per user. In-process deque per user.
# Per-worker — with 2 uvicorn workers a user could in theory do 10/10s, fine
# for our threat model (staff abuse).
_RL_WINDOW_S = 10.0
_RL_MAX = 5
_rl_buckets: dict[int, deque[float]] = defaultdict(lambda: deque(maxlen=_RL_MAX))
_rl_lock = asyncio.Lock()


async def _is_staff(db, user: User) -> bool:
    roles = await auth_service.get_user_roles(db, user.id)
    return any(getattr(r, "is_staff", False) for r in roles)


def _validate_command(cmd: str) -> None:
    cmd = cmd.strip()
    if not cmd.startswith(_ALLOWED_PREFIX):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Разрешены только {_ALLOWED_PREFIX}* команды",
        )
    if any(ch in _FORBIDDEN_CHARS for ch in cmd):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Недопустимые символы в команде (";` и переводы строк запрещены)',
        )
    if _AIM_RE.search(cmd):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`-g Aim` работает только в игре через bind — у RCON нет прицела",
        )
    if len(cmd) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Команда слишком длинная (макс 500 символов)",
        )


async def _check_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    async with _rl_lock:
        bucket = _rl_buckets[user_id]
        # Drop timestamps older than the window.
        while bucket and now - bucket[0] > _RL_WINDOW_S:
            bucket.popleft()
        if len(bucket) >= _RL_MAX:
            wait = _RL_WINDOW_S - (now - bucket[0])
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Лимит: 5 команд за 10 сек. Подожди {wait:.1f} с.",
            )
        bucket.append(now)


async def _audit(
    db,
    *,
    actor_id: int,
    command: str,
    response: str | None,
    success: bool,
    error: str | None,
    latency_ms: int | None,
) -> None:
    db.add(
        CsRconLog(
            actor_id=actor_id,
            command=command[:500],
            response=response[:4000] if response else None,
            success=success,
            error=error[:500] if error else None,
            latency_ms=latency_ms,
        )
    )
    await db.commit()


async def _run_one(
    db,
    actor_id: int,
    command: str,
) -> RconResult:
    """Validation + execute + audit for a single command. Returns a
    user-facing RconResult on success, raises HTTPException on failure
    (and audits the failure too)."""
    _validate_command(command)
    try:
        result = await cs_rcon.execute(command)
    except cs_rcon.RconError as e:
        await _audit(
            db,
            actor_id=actor_id,
            command=command,
            response=None,
            success=False,
            error=str(e),
            latency_ms=None,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"RCON: {e}",
        )
    await _audit(
        db,
        actor_id=actor_id,
        command=command,
        response=result.output,
        success=True,
        error=None,
        latency_ms=result.latency_ms,
    )
    return RconResult(
        ok=True,
        command=command,
        response=result.output,
        latency_ms=result.latency_ms,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/execute", response_model=RconResult)
async def execute_one(
    payload: RconCommand,
    user: CurrentUser,
    db: DbSession,
) -> RconResult:
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    await _check_rate_limit(user.id)
    return await _run_one(db, user.id, payload.command.strip())


@router.post("/batch", response_model=list[RconResult])
async def execute_batch(
    payload: RconBatch,
    user: CurrentUser,
    db: DbSession,
) -> list[RconResult]:
    """Run several commands sequentially. Each command counts against the
    rate limit. If any one fails the chain stops (later commands aren't
    run) — but all earlier successes are committed and audited."""
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )

    out: list[RconResult] = []
    for cmd in payload.commands:
        await _check_rate_limit(user.id)
        out.append(await _run_one(db, user.id, cmd.strip()))
    return out


# Sanitize the forum-supplied announce text:
#  1. strip quotes / control chars / semicolons (RCON / engine injection)
#  2. allow-list: ASCII printable (0x20-0x7E), Cyrillic (U+0400-U+04FF),
#     arrows (U+2190-U+21FF — e.g. →←↑↓), whitespace. Everything else
#     (emoji, CJK, dingbats, variation selectors) is stripped because
#     the CS 1.6 chat font renders them as empty rectangles.
#  3. collapse runs of whitespace
_ANNOUNCE_BAD_RE = re.compile(r"[\";`\n\r\x00]+")
_NON_PRINTABLE_RE = re.compile(r"[^\x20-\x7EЀ-ӿ←-⇿\s]")
_WS_COLLAPSE_RE = re.compile(r"\s{2,}")
_ANNOUNCE_MAX = 160


def _sanitize_announce(text: str) -> str:
    text = _ANNOUNCE_BAD_RE.sub(" ", text)
    text = _NON_PRINTABLE_RE.sub("", text)
    text = _WS_COLLAPSE_RE.sub(" ", text)
    return text.strip()[:_ANNOUNCE_MAX]


@router.post("/action", response_model=ActionResult)
async def execute_action(
    payload: ActionRequest,
    user: CurrentUser,
    db: DbSession,
) -> ActionResult:
    """Compound action: run a jbf_uaio command, optionally post a `say`
    announcement using the forum user's nickname (anti-impersonation: the
    nickname is sourced from auth, not from the frontend payload), and
    sync the cs_active_effects row.

    Counts as ONE rate-limit token even if it makes 2 RCON calls."""
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    await _check_rate_limit(user.id)

    command = payload.command.strip()
    _validate_command(command)

    # 1) Run the primary command.
    try:
        result = await cs_rcon.execute(command)
        primary_response = result.output
        primary_latency = result.latency_ms
    except cs_rcon.RconError as e:
        await _audit(
            db,
            actor_id=user.id,
            command=command,
            response=None,
            success=False,
            error=str(e),
            latency_ms=None,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"RCON: {e}"
        )
    await _audit(
        db,
        actor_id=user.id,
        command=command,
        response=primary_response,
        success=True,
        error=None,
        latency_ms=primary_latency,
    )

    # 2) Optional chat announce via `say <text>` — plain chat record.
    #    Colors via vanilla `say` aren't possible: ColorChat-style codes
    #    are only processed when a plugin uses `client_print` (with the
    #    actual say hooked), and `amx_tsay`/`amx_csay` is hijacked on
    #    this server by hudchat.amxx which crashes on `id=0` console
    #    callers. So we lean on a distinctive ASCII frame instead.
    #    `announce_color` is accepted for forward compatibility (if the
    #    user installs a helper plugin later we can promote to colored).
    announce_sent = False
    if payload.announce:
        sanitized = _sanitize_announce(payload.announce)
        nick = _sanitize_announce(user.nickname)
        target = (
            _sanitize_announce(payload.target_nick)
            if payload.target_nick
            else None
        )
        if sanitized and nick:
            target_part = f" → {target}" if target else ""
            # Plain ASCII frame so the line stands out among player
            # chatter. Stars / triangles / box-drawing chars would be
            # stripped by the sanitiser's allow-list (and most wouldn't
            # render in the CS chat font anyway).
            say_text = _sanitize_announce(
                f"[ FORUM ] {nick}{target_part} :: {sanitized}"
            )

            say_cmd = f"say {say_text}"
            try:
                say_res = await cs_rcon.execute(say_cmd)
                await _audit(
                    db,
                    actor_id=user.id,
                    command=say_cmd,
                    response=say_res.output,
                    success=True,
                    error=None,
                    latency_ms=say_res.latency_ms,
                )
                announce_sent = True
            except cs_rcon.RconError as e:
                await _audit(
                    db,
                    actor_id=user.id,
                    command=say_cmd,
                    response=None,
                    success=False,
                    error=str(e),
                    latency_ms=None,
                )

    # 3) Effects state.
    effect_state: str | None = None
    if payload.effect_slug and payload.target_steamid and payload.state:
        if payload.state == "grant":
            await cs_effects.grant(
                db,
                steamid=payload.target_steamid,
                effect_slug=payload.effect_slug,
                effect_label=payload.effect_label or payload.effect_slug,
                effect_emoji=payload.effect_emoji,
                granted_by_id=user.id,
                command=command,
                player_nick=payload.target_nick,
                duration_s=payload.duration_s,
            )
            effect_state = "granted"
        elif payload.state == "revoke":
            removed = await cs_effects.revoke(
                db,
                steamid=payload.target_steamid,
                effect_slug=payload.effect_slug,
            )
            effect_state = "revoked" if removed else None

    return ActionResult(
        ok=True,
        command=command,
        response=primary_response,
        announce_sent=announce_sent,
        effect_state=effect_state,
        latency_ms=primary_latency,
    )


@router.post("/say", response_model=SayResult)
async def say_to_cs_chat(
    payload: SayRequest,
    user: CurrentUser,
    db: DbSession,
) -> SayResult:
    """Push a free-form line into the CS server’s say channel.

    Anti-impersonation: the forum nickname is sourced from auth, never
    from the payload. Final shape is `[ FORUM ] <nick> :: <text>` so the
    in-game viewer sees the author, not a bare ‘Console’."""
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    await _check_rate_limit(user.id)

    sanitized = _sanitize_announce(payload.text)
    nick = _sanitize_announce(user.nickname)
    if not sanitized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пустой текст после санитаризации (разрешен ASCII + Кириллица + стрелки)",
        )
    if not nick:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось нормализовать ник",
        )
    say_text = _sanitize_announce(f"[ FORUM ] {nick} :: {sanitized}")
    say_cmd = f"say {say_text}"

    try:
        result = await cs_rcon.execute(say_cmd)
    except cs_rcon.RconError as e:
        await _audit(
            db,
            actor_id=user.id,
            command=say_cmd,
            response=None,
            success=False,
            error=str(e),
            latency_ms=None,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"RCON: {e}"
        )
    await _audit(
        db,
        actor_id=user.id,
        command=say_cmd,
        response=result.output,
        success=True,
        error=None,
        latency_ms=result.latency_ms,
    )
    return SayResult(ok=True, sent_text=say_text, latency_ms=result.latency_ms)


@router.post("/private-say", response_model=PrivateSayResult)
async def private_say(
    payload: PrivateSayRequest,
    user: CurrentUser,
    db: DbSession,
) -> PrivateSayResult:
    """Send a single-recipient in-game message via amx_psay.

    The forum nickname is taken from auth (anti-impersonation) and the
    final body is `[FORUM <nick>] :: <text>`. We reuse the global rate
    limit so a flood from the admin panel can't outpace the broadcast
    `say` flow.

    amx_psay format: `amx_psay <#userid> "<text>"`. The `#` prefix tells
    AMX to resolve by userid (1-based connection id) instead of nickname,
    which avoids nick collisions and CJK lookup issues."""
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    await _check_rate_limit(user.id)

    sanitized = _sanitize_announce(payload.text)
    nick = _sanitize_announce(user.nickname)
    if not sanitized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пустой текст после санитаризации (разрешен ASCII + Кириллица + стрелки)",
        )
    if not nick:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось нормализовать ник",
        )
    body_text = _sanitize_announce(f"[FORUM {nick}] :: {sanitized}")
    rcon_cmd = f'amx_psay #{int(payload.userid)} "{body_text}"'

    try:
        result = await cs_rcon.execute(rcon_cmd)
    except cs_rcon.RconError as e:
        await _audit(
            db,
            actor_id=user.id,
            command=rcon_cmd,
            response=None,
            success=False,
            error=str(e),
            latency_ms=None,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"RCON: {e}"
        )
    await _audit(
        db,
        actor_id=user.id,
        command=rcon_cmd,
        response=result.output,
        success=True,
        error=None,
        latency_ms=result.latency_ms,
    )
    return PrivateSayResult(
        ok=True,
        sent_text=body_text,
        target_userid=payload.userid,
        latency_ms=result.latency_ms,
    )


@router.get("/effects", response_model=list[ActiveEffectRead])
async def list_effects(
    user: CurrentUser,
    db: DbSession,
    steamid: list[str] = Query(default_factory=list, max_length=64),
) -> list[ActiveEffectRead]:
    """All non-expired effect rows for the given steamids. Pass each
    steamid as a repeated `?steamid=STEAM_0:0:X` query param."""
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    if not steamid:
        return []
    rows = await cs_effects.list_active(db, steamid)
    # Resolve granted_by nicknames in one batch.
    user_ids = {r.granted_by_id for r in rows if r.granted_by_id is not None}
    nicks: dict[int, str] = {}
    if user_ids:
        ures = await db.execute(
            select(User.id, User.nickname).where(User.id.in_(user_ids))
        )
        nicks = {uid: nick for uid, nick in ures.all()}
    out: list[ActiveEffectRead] = []
    for r in rows:
        item = ActiveEffectRead.model_validate(r)
        if r.granted_by_id is not None:
            item.granted_by_nickname = nicks.get(r.granted_by_id)
        out.append(item)
    return out


@router.get("/players", response_model=CsPlayersResponse)
async def list_players(
    user: CurrentUser,
    db: DbSession,
    force: bool = Query(default=False, description="Bypass the 5 s cache"),
) -> CsPlayersResponse:
    """Snapshot of who's on the CS server right now — names, steam ids,
    ping, frags — sourced from RCON `status`. 5 s in-process cache.
    Staff-only (the steam ids are PII-ish + you can derive routing info
    from the addr column)."""
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    try:
        data = await cs_rcon.status(force=force)
    except cs_rcon.RconError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"RCON: {e}"
        )
    return CsPlayersResponse(**data)


@router.get("/log", response_model=list[RconLogRead])
async def list_log(
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
    limit: int = Query(default=100, ge=1, le=500),
    before_id: int | None = Query(default=None),
    mine: bool = Query(default=False, description="Only my own commands"),
) -> list[RconLogRead]:
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )

    stmt = select(CsRconLog)
    if mine:
        stmt = stmt.where(CsRconLog.actor_id == user.id)
    if before_id is not None:
        stmt = stmt.where(CsRconLog.id < before_id)
    stmt = stmt.order_by(desc(CsRconLog.id)).limit(limit)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    # Resolve actor nicknames in one batch lookup.
    actor_ids = {r.actor_id for r in rows if r.actor_id is not None}
    nicknames: dict[int, str] = {}
    if actor_ids:
        ures = await db.execute(
            select(User.id, User.nickname).where(User.id.in_(actor_ids))
        )
        nicknames = {uid: nick for uid, nick in ures.all()}

    out: list[RconLogRead] = []
    for r in rows:
        item = RconLogRead.model_validate(r)
        if r.actor_id is not None:
            item.actor_nickname = nicknames.get(r.actor_id)
        out.append(item)
    return out
