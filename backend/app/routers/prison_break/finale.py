"""prison_break — EPIC 7 routes: reveals + Final Night + voting.

  GET    /api/event/prison-break/reveals
  POST   /api/event/prison-break/admin/reveals/schedule  (staff)
  POST   /api/event/prison-break/admin/reveals/fire      (staff)
  POST   /api/event/prison-break/admin/reveals/auto      (staff)

  GET    /api/event/prison-break/finale/snapshot
  GET    /api/event/prison-break/finale/tally
  GET    /api/event/prison-break/finale/outcome
  GET    /api/event/prison-break/finale/my-votes
  POST   /api/event/prison-break/finale/vote
  POST   /api/event/prison-break/admin/finale/finalise   (staff)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.prison_break import (
    PrisonBreakPlayer,
    PrisonBreakReveal,
)
from app.models.prison_break.extras import PrisonBreakFinalVote
from app.schemas.prison_break import (
    AdminRevealTrigger,
    FinalOutcomeOut,
    FinalVoteOut,
    FinalVoteRequest,
    FinalVoteTally,
    FinalVoteTallyEntry,
    IsometricCell,
    IsometricSnapshot,
    RevealOut,
)
from app.services import auth as auth_service
from app.services.prison_break import (
    event_service,
    finale_service,
    reveal_service,
)


finale_router = APIRouter(
    prefix="/api/event/prison-break", tags=["prison_break_finale"]
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_player(db, user_id: int):
    event = await event_service.find_current_event(db)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сейчас нет активного сезона.",
        )
    player = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.user_id == user_id,
        )
    )).scalar_one_or_none()
    if player is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ты не зарегистрирован на этот сезон.",
        )
    return event, player


async def _require_staff(db, user) -> None:
    roles = await auth_service.get_user_roles(db, user.id)
    if not any(getattr(r, "is_staff", False) for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов",
        )


def _reveal_to_out(r: PrisonBreakReveal) -> RevealOut:
    return RevealOut(
        id=r.id,
        day=r.day,
        reveal_type=r.reveal_type,
        payload=r.payload or {},
        scheduled_for=r.scheduled_for,
        revealed_at=r.revealed_at,
    )


# ---------------------------------------------------------------------------
# Reveals
# ---------------------------------------------------------------------------


@finale_router.get("/reveals", response_model=list[RevealOut])
async def get_reveals(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=30, ge=1, le=60),
    include_pending: bool = Query(default=False),
) -> list[RevealOut]:
    _, player = await _resolve_player(db, user.id)
    # Non-staff only sees fired reveals.
    if include_pending:
        roles = await auth_service.get_user_roles(db, user.id)
        is_staff = any(getattr(r, "is_staff", False) for r in roles)
        if not is_staff:
            include_pending = False
    rows = await reveal_service.list_visible(
        db, player.event_id, limit=limit, include_pending=include_pending,
    )
    return [_reveal_to_out(r) for r in rows]


@finale_router.post("/admin/reveals/schedule", response_model=dict)
async def post_schedule_default(
    user: CurrentUser,
    db: DbSession,
) -> dict:
    await _require_staff(db, user)
    event = await event_service.find_current_event(db)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="нет текущего сезона",
        )
    n = await reveal_service.ensure_default_schedule(db, event)
    await db.commit()
    return {"ok": True, "added": n}


@finale_router.post("/admin/reveals/fire", response_model=RevealOut)
async def post_fire_reveal(
    payload: AdminRevealTrigger,
    user: CurrentUser,
    db: DbSession,
) -> RevealOut:
    await _require_staff(db, user)
    event = await event_service.find_current_event(db)
    if event is None or event.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="нужен активный сезон",
        )
    try:
        reveal = await reveal_service.trigger_reveal_now(
            db, event, payload.reveal_type, day=payload.day,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    # Public broadcast
    try:
        from app.routers.prison_break.ws import BROADCASTER
        await BROADCASTER.broadcast(
            event.id,
            f"reveal_{reveal.reveal_type}",
            {"reveal_id": reveal.id, "day": reveal.day, "payload": reveal.payload},
            visibility="public",
        )
    except Exception:
        pass
    return _reveal_to_out(reveal)


@finale_router.post("/admin/reveals/auto", response_model=dict)
async def post_auto_fire(
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Fire every reveal whose scheduled_for is past."""
    await _require_staff(db, user)
    event = await event_service.find_current_event(db)
    if event is None or event.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="нужен активный сезон",
        )
    n = await reveal_service.auto_fire_due(db, event)
    await db.commit()
    return {"ok": True, "fired": n}


# ---------------------------------------------------------------------------
# Finale snapshot + voting
# ---------------------------------------------------------------------------


@finale_router.get("/finale/snapshot", response_model=IsometricSnapshot)
async def get_snapshot(
    user: CurrentUser,
    db: DbSession,
) -> IsometricSnapshot:
    event, _player = await _resolve_player(db, user.id)
    raw = await finale_service.isometric_snapshot(db, event)
    return IsometricSnapshot(
        event=raw["event"],
        cells=[IsometricCell(**c) for c in raw["cells"]],
        guards_unassigned=raw["guards_unassigned"],
        arena_active=raw["arena_active"],
        alliances_active=raw["alliances_active"],
        ts=raw["ts"],
    )


@finale_router.get("/finale/tally", response_model=FinalVoteTally)
async def get_tally(
    user: CurrentUser,
    db: DbSession,
) -> FinalVoteTally:
    event, _player = await _resolve_player(db, user.id)
    summary = await finale_service.vote_summary(db, event.id)
    return FinalVoteTally(
        boss=[FinalVoteTallyEntry(**x) for x in summary.get("boss", [])],
        snitch=[FinalVoteTallyEntry(**x) for x in summary.get("snitch", [])],
        hero=[FinalVoteTallyEntry(**x) for x in summary.get("hero", [])],
    )


@finale_router.get("/finale/outcome", response_model=FinalOutcomeOut)
async def get_outcome(
    user: CurrentUser,
    db: DbSession,
) -> FinalOutcomeOut:
    event, _player = await _resolve_player(db, user.id)
    outcome = await finale_service.compute_final_outcome(db, event)
    return FinalOutcomeOut(
        escaped_player_ids=outcome.escaped_player_ids,
        escape_count=outcome.escape_count,
        escape_rate=outcome.escape_rate,
        boss_correct_votes=outcome.boss_correct_votes,
        boss_voter_count=outcome.boss_voter_count,
        boss_correctly_identified=outcome.boss_correctly_identified,
        winning_side=outcome.winning_side,
        most_voted={k: int(v) for k, v in outcome.most_voted.items()},
        payouts={str(k): int(v) for k, v in outcome.payouts.items()},
    )


@finale_router.get("/finale/my-votes", response_model=dict)
async def get_my_votes(
    user: CurrentUser,
    db: DbSession,
) -> dict:
    _, player = await _resolve_player(db, user.id)
    out = await finale_service.my_votes(db, player)
    return out


@finale_router.post("/finale/vote", response_model=FinalVoteOut)
async def post_vote(
    payload: FinalVoteRequest,
    user: CurrentUser,
    db: DbSession,
) -> FinalVoteOut:
    _, player = await _resolve_player(db, user.id)
    try:
        vote = await finale_service.cast_vote(
            db, player, payload.target_player_id, payload.kind,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return FinalVoteOut(
        id=vote.id,
        voter_id=vote.voter_id,
        target_id=vote.target_id,
        kind=vote.kind,
        created_at=vote.created_at,
    )


@finale_router.post("/admin/finale/finalise", response_model=FinalOutcomeOut)
async def post_finalise(
    user: CurrentUser,
    db: DbSession,
) -> FinalOutcomeOut:
    """Compute final outcome + apply payouts + fire final_curtain reveal."""
    await _require_staff(db, user)
    event = await event_service.find_current_event(db)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="нет сезона",
        )
    outcome = await finale_service.compute_final_outcome(db, event)
    await finale_service.apply_payouts(db, event, outcome.payouts)
    # Fire final_curtain unless already revealed.
    final_curtain = (await db.execute(
        select(PrisonBreakReveal).where(
            PrisonBreakReveal.event_id == event.id,
            PrisonBreakReveal.reveal_type == "final_curtain",
            PrisonBreakReveal.revealed_at.is_(None),
        ).limit(1)
    )).scalar_one_or_none()
    if final_curtain is None:
        final_curtain = await reveal_service.trigger_reveal_now(
            db, event, "final_curtain", day=event.current_day,
        )
    else:
        await reveal_service.trigger_reveal(db, event, final_curtain)

    # Flip event to finished if still active.
    if event.status == "active":
        await event_service.transition_event(db, event, "finish")
    await db.commit()

    # Public WS event
    try:
        from app.routers.prison_break.ws import BROADCASTER
        await BROADCASTER.broadcast(
            event.id,
            "finale_resolved",
            {
                "winning_side": outcome.winning_side,
                "escape_rate": outcome.escape_rate,
                "boss_correctly_identified": outcome.boss_correctly_identified,
            },
            visibility="public",
        )
    except Exception:
        pass

    return FinalOutcomeOut(
        escaped_player_ids=outcome.escaped_player_ids,
        escape_count=outcome.escape_count,
        escape_rate=outcome.escape_rate,
        boss_correct_votes=outcome.boss_correct_votes,
        boss_voter_count=outcome.boss_voter_count,
        boss_correctly_identified=outcome.boss_correctly_identified,
        winning_side=outcome.winning_side,
        most_voted={k: int(v) for k, v in outcome.most_voted.items()},
        payouts={str(k): int(v) for k, v in outcome.payouts.items()},
    )
