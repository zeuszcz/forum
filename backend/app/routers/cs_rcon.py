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
    CsPlayersResponse,
    RconBatch,
    RconCommand,
    RconLogRead,
    RconResult,
)
from app.services import auth as auth_service
from app.services import cs_rcon

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
