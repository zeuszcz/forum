"""prison_break — EPIC 5 routes: lock-pick + patrol planner + interrogation.

Lock-pick
  POST   /api/event/prison-break/lockpick/start
  POST   /api/event/prison-break/lockpick/tap
  POST   /api/event/prison-break/lockpick/abandon
  GET    /api/event/prison-break/lockpick/active
  GET    /api/event/prison-break/lockpick/history

Patrol planner (guard-only)
  GET    /api/event/prison-break/patrol/today
  GET    /api/event/prison-break/patrol/block-cells
  POST   /api/event/prison-break/patrol/plan
  DELETE /api/event/prison-break/patrol/plan/{plan_id}
  POST   /api/event/prison-break/patrol/plan/{plan_id}/execute

Interrogation theatre
  POST   /api/event/prison-break/interrogation/start
  POST   /api/event/prison-break/interrogation/{id}/question
  POST   /api/event/prison-break/interrogation/{id}/answer
  POST   /api/event/prison-break/interrogation/{id}/abort
  GET    /api/event/prison-break/interrogation/list
  GET    /api/event/prison-break/interrogation/{id}
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.prison_break import PrisonBreakPlayer
from app.schemas.prison_break import (
    InterrogationAnswer,
    InterrogationOut,
    InterrogationQuestion,
    InterrogationStartRequest,
    InterrogationTurnOut,
    InterrogationTurnResult,
    LockpickStartRequest,
    LockpickStatus,
    LockpickTapRequest,
    LockpickTapResult,
    PatrolCellInfo,
    PatrolExecuteResult,
    PatrolPlanOut,
    PatrolPlanRequest,
    PatrolStepOut,
)
from app.services.prison_break import (
    event_service,
    interrogation_service,
    lockpick_service,
    patrol_service,
)


minigames_router = APIRouter(
    prefix="/api/event/prison-break",
    tags=["prison_break_minigames"],
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def _resolve_player(db, user_id: int):
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


def _lockpick_to_status(s) -> LockpickStatus:
    return LockpickStatus(
        id=s.id,
        target_cell_id=s.target_cell_id,
        difficulty=s.difficulty,
        current_pin=s.current_pin,
        misses=s.misses,
        forgive_misses=s.forgive_misses,
        key_quality=s.key_quality,
        status=s.status,
        started_at=s.started_at,
        ended_at=s.ended_at,
        outcome=s.outcome or {},
    )


# ---------------------------------------------------------------------------
# Lock-pick
# ---------------------------------------------------------------------------


@minigames_router.post("/lockpick/start", response_model=LockpickStatus)
async def post_lockpick_start(
    payload: LockpickStartRequest,
    user: CurrentUser,
    db: DbSession,
) -> LockpickStatus:
    _, player = await _resolve_player(db, user.id)
    try:
        s = await lockpick_service.start_session(
            db, player, payload.target_cell_id,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return _lockpick_to_status(s)


@minigames_router.post("/lockpick/tap", response_model=LockpickTapResult)
async def post_lockpick_tap(
    payload: LockpickTapRequest,
    user: CurrentUser,
    db: DbSession,
) -> LockpickTapResult:
    _, player = await _resolve_player(db, user.id)
    active = await lockpick_service.get_active_session(db, player)
    if active is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="нет активной сессии",
        )
    try:
        res = await lockpick_service.submit_tap(db, player, active.id, payload.pin_pick)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return LockpickTapResult(
        correct=res.correct,
        current_pin=res.current_pin,
        misses=res.misses,
        forgive_misses=res.forgive_misses,
        status=res.status,
        outcome=res.outcome,
    )


@minigames_router.post("/lockpick/abandon", response_model=LockpickStatus)
async def post_lockpick_abandon(
    user: CurrentUser,
    db: DbSession,
) -> LockpickStatus:
    _, player = await _resolve_player(db, user.id)
    active = await lockpick_service.get_active_session(db, player)
    if active is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="нет активной сессии",
        )
    s = await lockpick_service.abandon_session(db, player, active.id)
    await db.commit()
    return _lockpick_to_status(s)


@minigames_router.get("/lockpick/active", response_model=LockpickStatus | None)
async def get_lockpick_active(
    user: CurrentUser,
    db: DbSession,
) -> LockpickStatus | None:
    _, player = await _resolve_player(db, user.id)
    s = await lockpick_service.get_active_session(db, player)
    return _lockpick_to_status(s) if s else None


@minigames_router.get("/lockpick/history", response_model=list[LockpickStatus])
async def get_lockpick_history(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=10, ge=1, le=50),
) -> list[LockpickStatus]:
    _, player = await _resolve_player(db, user.id)
    sessions = await lockpick_service.list_recent_sessions(db, player, limit=limit)
    return [_lockpick_to_status(s) for s in sessions]


# ---------------------------------------------------------------------------
# Patrol planner
# ---------------------------------------------------------------------------


def _plan_to_out(p) -> PatrolPlanOut:
    return PatrolPlanOut(
        id=p.id,
        block=p.block,
        route=list(p.route or []),
        focus=p.focus,
        valid_for_day=p.valid_for_day,
        executed=p.executed,
        executed_at=p.executed_at,
        result=p.result or {},
        created_at=p.created_at,
    )


@minigames_router.get("/patrol/today", response_model=PatrolPlanOut | None)
async def get_patrol_today(
    user: CurrentUser,
    db: DbSession,
) -> PatrolPlanOut | None:
    event, player = await _resolve_player(db, user.id)
    if player.role != "guard":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="только для охраны",
        )
    plan = await patrol_service.get_today_plan(db, player, event)
    return _plan_to_out(plan) if plan else None


@minigames_router.get("/patrol/block-cells", response_model=list[PatrolCellInfo])
async def get_patrol_block_cells(
    user: CurrentUser,
    db: DbSession,
) -> list[PatrolCellInfo]:
    _, player = await _resolve_player(db, user.id)
    if player.role != "guard" or player.block is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="только для охраны с назначенным блоком",
        )
    cells = await patrol_service.list_block_cells(db, player.event_id, player.block)
    return [
        PatrolCellInfo(
            cell_id=c.id,
            block=c.block,
            number=c.number,
            tunnel_progress=c.tunnel_progress,
            tunnel_discovered=c.tunnel_discovered,
        )
        for c in cells
    ]


@minigames_router.post("/patrol/plan", response_model=PatrolPlanOut)
async def post_patrol_plan(
    payload: PatrolPlanRequest,
    user: CurrentUser,
    db: DbSession,
) -> PatrolPlanOut:
    event, player = await _resolve_player(db, user.id)
    try:
        plan = await patrol_service.create_or_update_plan(
            db, player, event, payload.route, payload.focus,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return _plan_to_out(plan)


@minigames_router.delete("/patrol/plan/{plan_id}", response_model=dict)
async def delete_patrol_plan(
    plan_id: int,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    _, player = await _resolve_player(db, user.id)
    try:
        await patrol_service.cancel_plan(db, player, plan_id)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return {"ok": True}


@minigames_router.post(
    "/patrol/plan/{plan_id}/execute", response_model=PatrolExecuteResult,
)
async def post_patrol_execute(
    plan_id: int,
    user: CurrentUser,
    db: DbSession,
) -> PatrolExecuteResult:
    _, player = await _resolve_player(db, user.id)
    try:
        res = await patrol_service.execute_plan(db, player, plan_id)
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    # Broadcast bust events publicly (best-effort).
    try:
        from app.routers.prison_break.ws import BROADCASTER
        import asyncio as _aio
        for step in res.steps:
            if step.outcome == "busted":
                _aio.create_task(BROADCASTER.broadcast(
                    player.event_id,
                    "patrol_planned_bust",
                    {
                        "plan_id": res.plan_id,
                        "cell_id": step.cell_id,
                        "block": step.block,
                        "number": step.number,
                    },
                    visibility="public",
                    actor_id=player.id,
                ))
    except Exception:
        pass

    return PatrolExecuteResult(
        ok=True,
        plan_id=res.plan_id,
        ap_spent=res.ap_spent,
        ap_remaining=player.ap_current,
        steps=[
            PatrolStepOut(
                cell_id=s.cell_id,
                block=s.block,
                number=s.number,
                outcome=s.outcome,
                tunnel_progress_before=s.tunnel_progress_before,
                tunnel_progress_after=s.tunnel_progress_after,
            )
            for s in res.steps
        ],
    )


# ---------------------------------------------------------------------------
# Interrogation
# ---------------------------------------------------------------------------


def _session_to_out(session, viewer_id: int, turns: list | None = None) -> InterrogationOut:
    return InterrogationOut(
        id=session.id,
        interrogator_id=session.interrogator_id,
        suspect_id=session.suspect_id,
        topic=session.topic,
        status=session.status,
        rounds_remaining=session.rounds_remaining,
        pressure=session.pressure,
        trust_loss=session.trust_loss,
        started_at=session.started_at,
        ended_at=session.ended_at,
        outcome=session.outcome or {},
        turns=[
            InterrogationTurnOut(
                id=t.id,
                role=t.role,
                speaker_id=t.speaker_id,
                tactic=t.tactic,
                body=t.body,
                delta_pressure=t.delta_pressure,
                created_at=t.created_at,
            )
            for t in (turns or [])
        ],
        is_interrogator=session.interrogator_id == viewer_id,
        is_suspect=session.suspect_id == viewer_id,
    )


@minigames_router.post("/interrogation/start", response_model=InterrogationOut)
async def post_interrogation_start(
    payload: InterrogationStartRequest,
    user: CurrentUser,
    db: DbSession,
) -> InterrogationOut:
    _, player = await _resolve_player(db, user.id)
    try:
        session = await interrogation_service.start(
            db, player, payload.suspect_player_id, payload.topic,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    # WS push to suspect (best-effort).
    try:
        from app.routers.prison_break.ws import BROADCASTER
        import asyncio as _aio
        _aio.create_task(BROADCASTER.broadcast(
            player.event_id,
            "interrogation_start",
            {
                "session_id": session.id,
                "interrogator_id": player.id,
                "topic": session.topic,
            },
            visibility="private",
            actor_id=player.id,
            target_id=payload.suspect_player_id,
        ))
    except Exception:
        pass

    turns = await interrogation_service.list_turns(db, session)
    return _session_to_out(session, player.id, turns)


@minigames_router.post(
    "/interrogation/{session_id}/question", response_model=InterrogationTurnResult,
)
async def post_interrogation_question(
    session_id: int,
    payload: InterrogationQuestion,
    user: CurrentUser,
    db: DbSession,
) -> InterrogationTurnResult:
    _, player = await _resolve_player(db, user.id)
    try:
        res = await interrogation_service.submit_question(
            db, player, session_id, payload.tactic, payload.body,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return InterrogationTurnResult(
        ok=True,
        pressure=res.pressure,
        rounds_remaining=res.rounds_remaining,
        status=res.status,
        outcome=res.outcome,
        ap_remaining=player.ap_current,
    )


@minigames_router.post(
    "/interrogation/{session_id}/answer", response_model=InterrogationTurnResult,
)
async def post_interrogation_answer(
    session_id: int,
    payload: InterrogationAnswer,
    user: CurrentUser,
    db: DbSession,
) -> InterrogationTurnResult:
    _, player = await _resolve_player(db, user.id)
    try:
        res = await interrogation_service.submit_answer(
            db, player, session_id, payload.tactic, payload.body,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return InterrogationTurnResult(
        ok=True,
        pressure=res.pressure,
        rounds_remaining=res.rounds_remaining,
        status=res.status,
        outcome=res.outcome,
        ap_remaining=player.ap_current,
    )


@minigames_router.post(
    "/interrogation/{session_id}/abort", response_model=InterrogationOut,
)
async def post_interrogation_abort(
    session_id: int,
    user: CurrentUser,
    db: DbSession,
) -> InterrogationOut:
    _, player = await _resolve_player(db, user.id)
    try:
        session = await interrogation_service.abort(db, player, session_id)
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    turns = await interrogation_service.list_turns(db, session)
    return _session_to_out(session, player.id, turns)


@minigames_router.get("/interrogation/list", response_model=list[InterrogationOut])
async def get_interrogation_list(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=50),
) -> list[InterrogationOut]:
    _, player = await _resolve_player(db, user.id)
    sessions = await interrogation_service.list_for_player(db, player, limit=limit)
    return [_session_to_out(s, player.id) for s in sessions]


@minigames_router.get("/interrogation/{session_id}", response_model=InterrogationOut)
async def get_interrogation_one(
    session_id: int,
    user: CurrentUser,
    db: DbSession,
) -> InterrogationOut:
    _, player = await _resolve_player(db, user.id)
    try:
        session = await interrogation_service.get_owned(db, player, session_id)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    turns = await interrogation_service.list_turns(db, session)
    return _session_to_out(session, player.id, turns)
