"""prison_break — HTTP routes for the event.

  GET    /api/event/prison-break/status         -- public + own player state
  POST   /api/event/prison-break/signup         -- register as player
  POST   /api/event/prison-break/welcome-ack    -- mark welcome cinematic seen
  GET    /api/event/prison-break/players        -- list players (public profiles)
  GET    /api/event/prison-break/me             -- own full player state

Admin (staff only):
  POST   /api/event/prison-break/admin/create   -- create new draft event
  POST   /api/event/prison-break/admin/action   -- transition open_signup/start/finish/cancel
  GET    /api/event/prison-break/admin/list     -- list all events
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser, DbSession
from app.models.prison_break import (
    PrisonBreakEvent,
    PrisonBreakPlayer,
)
from app.models.user import User
from app.schemas.prison_break import (
    AdminCreateEvent,
    AdminEventAction,
    AdminEventResult,
    EventPublic,
    EventStatus,
    PlayerMe,
    PlayerPublic,
    SignupRequest,
    WelcomeAck,
)
from app.services import auth as auth_service
from app.services.prison_break import event_service

router = APIRouter(prefix="/api/event/prison-break", tags=["prison_break"])


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


async def _is_staff(db: AsyncSession, user: User) -> bool:
    roles = await auth_service.get_user_roles(db, user.id)
    return any(getattr(r, "is_staff", False) for r in roles)


async def _build_event_public(
    db: AsyncSession,
    event: PrisonBreakEvent,
    me_user_id: int | None,
) -> EventPublic:
    count = (await db.execute(
        select(func.count()).select_from(PrisonBreakPlayer)
        .where(PrisonBreakPlayer.event_id == event.id)
    )).scalar() or 0
    is_signed_up = False
    if me_user_id is not None:
        is_signed_up = (await db.execute(
            select(func.count()).select_from(PrisonBreakPlayer)
            .where(
                PrisonBreakPlayer.event_id == event.id,
                PrisonBreakPlayer.user_id == me_user_id,
            )
        )).scalar() == 1
    can_signup = (
        event.status == "signup"
        and not is_signed_up
        and me_user_id is not None
    )
    return EventPublic(
        id=event.id,
        season=event.season,
        title=event.title,
        description=event.description or "",
        status=event.status,
        current_phase=event.current_phase,
        current_day=event.current_day,
        signup_opens_at=event.signup_opens_at,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        config=event.config or {},
        registered_count=count,
        is_signed_up=is_signed_up,
        can_signup=can_signup,
    )


def _player_to_me(p: PrisonBreakPlayer) -> PlayerMe:
    return PlayerMe(
        id=p.id,
        event_id=p.event_id,
        nickname=p.nickname,
        tattoo=p.tattoo,
        article=p.article,
        role=p.role,
        faction=p.faction,
        block=p.block,
        cell_id=p.cell_id,
        ap_current=p.ap_current,
        ap_max=p.ap_max,
        money=p.money,
        resource_scrap=p.resource_scrap,
        resource_paper=p.resource_paper,
        status=p.status,
        welcome_seen_at=p.welcome_seen_at,
        joined_at=p.joined_at,
    )


# ----------------------------------------------------------------------
# Public endpoints
# ----------------------------------------------------------------------


@router.get("/status", response_model=EventStatus)
async def get_status(
    user: CurrentUser,
    db: DbSession,
) -> EventStatus:
    """Return the current event + own player state (if any)."""
    event = await event_service.find_current_event(db)
    # Also surface most-recent finished event if no current — that lets
    # the dashboard show "Season X ended on Y" instead of blank slate.
    if event is None:
        rows = await db.execute(
            select(PrisonBreakEvent)
            .where(PrisonBreakEvent.status.in_(["finished", "cancelled"]))
            .order_by(PrisonBreakEvent.id.desc())
            .limit(1)
        )
        event = rows.scalar_one_or_none()
    if event is None:
        return EventStatus(event=None, player=None)
    event_pub = await _build_event_public(db, event, user.id)
    rows = await db.execute(
        select(PrisonBreakPlayer)
        .where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.user_id == user.id,
        )
    )
    player = rows.scalar_one_or_none()
    return EventStatus(
        event=event_pub,
        player=_player_to_me(player) if player else None,
    )


@router.post("/signup", response_model=PlayerMe, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    user: CurrentUser,
    db: DbSession,
) -> PlayerMe:
    event = await event_service.find_current_event(db)
    if event is None or event.status != "signup":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No event currently accepting signups.",
        )
    # Uniqueness check first
    existing = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.user_id == user.id,
        )
    )).scalar_one_or_none()
    if existing is not None:
        return _player_to_me(existing)
    player = PrisonBreakPlayer(
        event_id=event.id,
        user_id=user.id,
        nickname=payload.nickname,
        tattoo=payload.tattoo,
        article=payload.article,
        role=None,
        faction=None,
        ap_current=event.config.get("ap_daily_base", 3),
        ap_max=event.config.get("ap_daily_base", 3),
    )
    db.add(player)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already signed up.",
        ) from None
    await db.refresh(player)
    return _player_to_me(player)


@router.post("/welcome-ack", response_model=WelcomeAck)
async def welcome_ack(
    user: CurrentUser,
    db: DbSession,
) -> WelcomeAck:
    event = await event_service.find_current_event(db)
    if event is None:
        return WelcomeAck(ok=False)
    rows = await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.user_id == user.id,
        )
    )
    player = rows.scalar_one_or_none()
    if player is None:
        return WelcomeAck(ok=False)
    if player.welcome_seen_at is None:
        player.welcome_seen_at = datetime.now(UTC)
        await db.commit()
    return WelcomeAck(ok=True)


@router.get("/players", response_model=list[PlayerPublic])
async def list_players(
    user: CurrentUser,
    db: DbSession,
) -> list[PlayerPublic]:
    event = await event_service.find_current_event(db)
    if event is None:
        return []
    rows = await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.event_id == event.id)
    )
    out: list[PlayerPublic] = []
    for p in rows.scalars():
        # Show role publicly only once it's revealed (after a Reveal phase
        # in future EPIC 7). For now hide all roles.
        out.append(PlayerPublic(
            id=p.id,
            nickname=p.nickname,
            tattoo=p.tattoo,
            block=p.block,
            cell_id=p.cell_id,
            status=p.status,
            revealed_role=None,
        ))
    return out


# ----------------------------------------------------------------------
# Admin endpoints
# ----------------------------------------------------------------------


@router.post("/admin/create", response_model=AdminEventResult)
async def admin_create_event(
    payload: AdminCreateEvent,
    user: CurrentUser,
    db: DbSession,
) -> AdminEventResult:
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    try:
        event = await event_service.create_event(
            db,
            season=payload.season,
            title=payload.title,
            description=payload.description,
            signup_opens_at=payload.signup_opens_at,
            starts_at=payload.starts_at,
            duration_days=payload.duration_days,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return AdminEventResult(
        ok=True,
        event_id=event.id,
        new_status=event.status,
        message=f"Created event {event.season} (id={event.id})",
    )


@router.post("/admin/action", response_model=AdminEventResult)
async def admin_event_action(
    payload: AdminEventAction,
    user: CurrentUser,
    db: DbSession,
) -> AdminEventResult:
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    event = await event_service.find_current_event(db)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active event to transition.",
        )
    try:
        await event_service.transition_event(db, event, payload.action)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return AdminEventResult(
        ok=True,
        event_id=event.id,
        new_status=event.status,
        message=f"Event transitioned to {event.status}",
    )


@router.get("/admin/list", response_model=list[EventPublic])
async def admin_list_events(
    user: CurrentUser,
    db: DbSession,
) -> list[EventPublic]:
    if not await _is_staff(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    rows = await db.execute(
        select(PrisonBreakEvent).order_by(PrisonBreakEvent.id.desc())
    )
    out: list[EventPublic] = []
    for ev in rows.scalars():
        out.append(await _build_event_public(db, ev, user.id))
    return out
