"""prison_break — action HTTP endpoint + cell endpoints + daily tick admin."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.prison_break import (
    PrisonBreakCell,
    PrisonBreakPlayer,
)
from app.models.prison_break.extras import PrisonBreakCellMessage
from app.services.prison_break import action_service, event_service


actions_router = APIRouter(prefix="/api/event/prison-break", tags=["prison_break_actions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_player(db, user_id: int) -> tuple:
    event = await event_service.find_current_event(db)
    if event is None or event.status != "active":
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


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


class ActionRequest(BaseModel):
    action_type: str = Field(min_length=1, max_length=40)
    target_id: int | None = None
    idempotency_key: str | None = Field(default=None, max_length=64)


class ActionResponse(BaseModel):
    ok: bool
    action_type: str
    ap_spent: int
    ap_remaining: int
    message: str
    payload: dict


@actions_router.post("/action", response_model=ActionResponse)
async def submit_action(
    payload: ActionRequest,
    user: CurrentUser,
    db: DbSession,
) -> ActionResponse:
    _, player = await _resolve_player(db, user.id)
    try:
        result = await action_service.run_action(
            db,
            actor=player,
            action_type=payload.action_type,
            target_id=payload.target_id,
            idempotency_key=payload.idempotency_key,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return ActionResponse(
        ok=result.ok,
        action_type=result.action_type,
        ap_spent=result.ap_spent,
        ap_remaining=result.ap_remaining,
        message=result.message,
        payload=result.payload,
    )


# ---------------------------------------------------------------------------
# Cell
# ---------------------------------------------------------------------------


class CellMessageOut(BaseModel):
    id: int
    author_id: int
    body: str
    created_at: str


class CellMembersOut(BaseModel):
    id: int
    nickname: str
    tattoo: str
    ap_current: int
    ap_max: int


class CellOut(BaseModel):
    id: int
    block: str
    number: int
    tunnel_progress: int
    tunnel_discovered: bool
    locked_until: str | None
    members: list[CellMembersOut]


class CellSummary(BaseModel):
    id: int
    block: str
    number: int
    tunnel_progress: int
    tunnel_discovered: bool
    locked_until: str | None


@actions_router.get("/cells", response_model=list[CellSummary])
async def list_cells(
    user: CurrentUser,
    db: DbSession,
) -> list[CellSummary]:
    """Lightweight cell directory — exposed to any registered player so the
    lock-pick UI can list targets across blocks. Sensitive fields (members,
    chat) live behind /cells/{id}."""
    _, _player = await _resolve_player(db, user.id)
    rows = await db.execute(
        select(PrisonBreakCell)
        .where(PrisonBreakCell.event_id == _player.event_id)
        .order_by(PrisonBreakCell.block, PrisonBreakCell.number)
    )
    return [
        CellSummary(
            id=c.id,
            block=c.block,
            number=c.number,
            tunnel_progress=c.tunnel_progress,
            tunnel_discovered=c.tunnel_discovered,
            locked_until=c.locked_until.isoformat() if c.locked_until else None,
        )
        for c in rows.scalars()
    ]


@actions_router.get("/cells/{cell_id}", response_model=CellOut)
async def get_cell(
    cell_id: int,
    user: CurrentUser,
    db: DbSession,
) -> CellOut:
    _, player = await _resolve_player(db, user.id)
    if player.cell_id != cell_id:
        # Only cellmates can view cell internals.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Это не твоя камера.",
        )
    cell = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.id == cell_id)
    )).scalar_one_or_none()
    if cell is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Камера не найдена.")
    members = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.cell_id == cell_id)
    )).scalars().all()
    return CellOut(
        id=cell.id,
        block=cell.block,
        number=cell.number,
        tunnel_progress=cell.tunnel_progress,
        tunnel_discovered=cell.tunnel_discovered,
        locked_until=cell.locked_until.isoformat() if cell.locked_until else None,
        members=[
            CellMembersOut(
                id=m.id,
                nickname=m.nickname,
                tattoo=m.tattoo,
                ap_current=m.ap_current,
                ap_max=m.ap_max,
            )
            for m in members
        ],
    )


@actions_router.get("/cells/{cell_id}/messages", response_model=list[CellMessageOut])
async def list_cell_messages(
    cell_id: int,
    user: CurrentUser,
    db: DbSession,
    limit: int = 50,
) -> list[CellMessageOut]:
    _, player = await _resolve_player(db, user.id)
    if player.cell_id != cell_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Это не твоя камера.",
        )
    rows = await db.execute(
        select(PrisonBreakCellMessage)
        .where(PrisonBreakCellMessage.cell_id == cell_id)
        .order_by(PrisonBreakCellMessage.id.desc())
        .limit(min(200, limit))
    )
    msgs = list(rows.scalars())
    msgs.reverse()
    return [
        CellMessageOut(
            id=m.id,
            author_id=m.author_id,
            body=m.body,
            created_at=m.created_at.isoformat(),
        )
        for m in msgs
    ]


@actions_router.post("/cells/{cell_id}/messages", response_model=CellMessageOut, status_code=201)
async def post_cell_message(
    cell_id: int,
    body: Annotated[str, Body(embed=True, min_length=1, max_length=500)],
    user: CurrentUser,
    db: DbSession,
) -> CellMessageOut:
    _, player = await _resolve_player(db, user.id)
    if player.cell_id != cell_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Это не твоя камера.",
        )
    row = PrisonBreakCellMessage(
        event_id=player.event_id,
        cell_id=cell_id,
        author_id=player.id,
        body=body.strip(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    # Broadcast to cell WS subscribers (best-effort).
    try:
        from app.routers.prison_break.ws import BROADCASTER
        import asyncio as _aio
        _aio.create_task(BROADCASTER.broadcast(
            player.event_id,
            "cell_chat",
            {
                "id": row.id,
                "cell_id": cell_id,
                "author_id": player.id,
                "body": row.body,
                "created_at": row.created_at.isoformat(),
            },
            visibility="cell",
            cell_id=cell_id,
            actor_id=player.id,
        ))
    except Exception:
        pass
    return CellMessageOut(
        id=row.id,
        author_id=row.author_id,
        body=row.body,
        created_at=row.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Daily tick (admin)
# ---------------------------------------------------------------------------


class DailyTickResult(BaseModel):
    ok: bool
    advanced_to_day: int
    phase: str
    players_refilled: int


@actions_router.post("/admin/daily-tick", response_model=DailyTickResult)
async def admin_daily_tick(
    user: CurrentUser,
    db: DbSession,
) -> DailyTickResult:
    """Run one daily tick. Admin can invoke manually; cron should hit this
    at 00:00 МСК."""
    from app.services import auth as auth_service
    roles = await auth_service.get_user_roles(db, user.id)
    if not any(getattr(r, "is_staff", False) for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    event = await event_service.find_current_event(db)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Нет активного сезона."
        )
    refilled = await action_service.daily_tick(db, event)
    await db.commit()
    return DailyTickResult(
        ok=True,
        advanced_to_day=event.current_day,
        phase=event.current_phase,
        players_refilled=refilled,
    )
