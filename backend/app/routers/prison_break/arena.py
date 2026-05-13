"""prison_break — EPIC 6 arena routes.

  GET    /api/event/prison-break/arena/specials       -- catalog
  GET    /api/event/prison-break/arena/loadout        -- my loadout
  PUT    /api/event/prison-break/arena/loadout        -- set my loadout
  GET    /api/event/prison-break/arena/matches        -- active matches
  GET    /api/event/prison-break/arena/history        -- finished matches
  POST   /api/event/prison-break/arena/challenge      -- new challenge
  POST   /api/event/prison-break/arena/{id}/accept    -- accept challenge
  POST   /api/event/prison-break/arena/{id}/decline   -- decline pending
  POST   /api/event/prison-break/arena/{id}/forfeit   -- give up while active
  POST   /api/event/prison-break/arena/{id}/input     -- enqueue input intent
  POST   /api/event/prison-break/arena/{id}/bet       -- place spectator bet
  GET    /api/event/prison-break/arena/{id}/bets      -- list bets
  GET    /api/event/prison-break/arena/{id}/state     -- one-shot snapshot
  WS     /api/event/prison-break/arena/{id}/ws        -- live state stream
"""
from __future__ import annotations

import asyncio
import json
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Cookie,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.deps import COOKIE_NAME, CurrentUser, DbSession
from app.core.security import decode_token
from app.models.prison_break import (
    PrisonBreakArenaMatch,
    PrisonBreakPlayer,
)
from app.schemas.prison_break import (
    ArenaBetOut,
    ArenaBetRequest,
    ArenaChallengeRequest,
    ArenaInputRequest,
    ArenaInputResult,
    ArenaLoadoutOut,
    ArenaLoadoutRequest,
    ArenaMatchOut,
    ArenaSpecial,
    ArenaStateOut,
)
from app.services.prison_break import arena_engine, arena_service, event_service


arena_router = APIRouter(
    prefix="/api/event/prison-break/arena", tags=["prison_break_arena"]
)


# ---------------------------------------------------------------------------
# Helpers
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


def _match_to_out(m: PrisonBreakArenaMatch, viewer_id: int) -> ArenaMatchOut:
    meta = (m.replay or {}).get("meta") or {}
    return ArenaMatchOut(
        id=m.id,
        event_id=m.event_id,
        player_a_id=m.player_a_id,
        player_b_id=m.player_b_id,
        status=m.status,
        winner_id=m.winner_id,
        started_at=m.started_at,
        ended_at=m.ended_at,
        created_at=m.created_at,
        loadout_a=list(meta.get("loadout_a") or []),
        loadout_b=list(meta.get("loadout_b") or []),
        is_a=m.player_a_id == viewer_id,
        is_b=m.player_b_id == viewer_id,
        is_participant=viewer_id in (m.player_a_id, m.player_b_id),
    )


def _engine_snapshot_to_state(snap: dict[str, Any]) -> ArenaStateOut:
    return ArenaStateOut(
        kind=snap.get("kind", "tick"),
        match_id=snap.get("match_id", 0),
        tick=snap.get("tick", 0),
        max_ticks=snap.get("max_ticks", 0),
        stage=snap.get("stage", {"w": 800, "h": 240}),
        fighters=snap.get("fighters", {}),
        finished=bool(snap.get("finished")),
        winner_side=snap.get("winner_side"),
        winner_id=snap.get("winner_id"),
        recent_events=snap.get("recent_events", []),
    )


# ---------------------------------------------------------------------------
# Static catalog + loadout
# ---------------------------------------------------------------------------


@arena_router.get("/specials", response_model=list[ArenaSpecial])
async def get_specials() -> list[ArenaSpecial]:
    return [ArenaSpecial(**s) for s in arena_engine.specials_catalog()]


@arena_router.get("/loadout", response_model=ArenaLoadoutOut)
async def get_my_loadout(
    user: CurrentUser,
    db: DbSession,
) -> ArenaLoadoutOut:
    _, player = await _resolve_player(db, user.id)
    out = arena_service.get_loadout(player)
    return ArenaLoadoutOut(**out)


@arena_router.put("/loadout", response_model=ArenaLoadoutOut)
async def put_my_loadout(
    payload: ArenaLoadoutRequest,
    user: CurrentUser,
    db: DbSession,
) -> ArenaLoadoutOut:
    _, player = await _resolve_player(db, user.id)
    try:
        out = await arena_service.update_loadout(db, player, payload.specials)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return ArenaLoadoutOut(**out)


# ---------------------------------------------------------------------------
# Match listings
# ---------------------------------------------------------------------------


@arena_router.get("/matches", response_model=list[ArenaMatchOut])
async def list_active_matches(
    user: CurrentUser,
    db: DbSession,
) -> list[ArenaMatchOut]:
    event, player = await _resolve_player(db, user.id)
    rows = await arena_service.list_active(db, event.id)
    return [_match_to_out(m, player.id) for m in rows]


@arena_router.get("/history", response_model=list[ArenaMatchOut])
async def list_history(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=60),
) -> list[ArenaMatchOut]:
    event, player = await _resolve_player(db, user.id)
    rows = await arena_service.list_history(db, event.id, limit=limit)
    return [_match_to_out(m, player.id) for m in rows]


# ---------------------------------------------------------------------------
# Lifecycle endpoints
# ---------------------------------------------------------------------------


@arena_router.post("/challenge", response_model=ArenaMatchOut, status_code=201)
async def post_challenge(
    payload: ArenaChallengeRequest,
    user: CurrentUser,
    db: DbSession,
) -> ArenaMatchOut:
    _, player = await _resolve_player(db, user.id)
    try:
        match = await arena_service.challenge(db, player, payload.opponent_player_id)
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    # Notify opponent (best-effort)
    try:
        from app.routers.prison_break.ws import BROADCASTER
        import asyncio as _aio
        _aio.create_task(BROADCASTER.broadcast(
            player.event_id,
            "arena_challenge",
            {"match_id": match.id, "challenger_id": player.id},
            visibility="private",
            actor_id=player.id,
            target_id=payload.opponent_player_id,
        ))
    except Exception:
        pass

    return _match_to_out(match, player.id)


@arena_router.post("/{match_id}/decline", response_model=ArenaMatchOut)
async def post_decline(
    match_id: int,
    user: CurrentUser,
    db: DbSession,
) -> ArenaMatchOut:
    _, player = await _resolve_player(db, user.id)
    try:
        match = await arena_service.decline(db, player, match_id)
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return _match_to_out(match, player.id)


@arena_router.post("/{match_id}/accept", response_model=ArenaMatchOut)
async def post_accept(
    match_id: int,
    user: CurrentUser,
    db: DbSession,
) -> ArenaMatchOut:
    _, player = await _resolve_player(db, user.id)
    try:
        match, engine_match = await arena_service.accept(db, player, match_id)
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    engine_match.start()
    # Start a watchdog that finalises the DB row once the engine reports done.
    asyncio.create_task(_watch_for_finish(match.id))

    # Public WS push
    try:
        from app.routers.prison_break.ws import BROADCASTER
        import asyncio as _aio
        _aio.create_task(BROADCASTER.broadcast(
            player.event_id,
            "arena_start",
            {
                "match_id": match.id,
                "player_a_id": match.player_a_id,
                "player_b_id": match.player_b_id,
            },
            visibility="public",
        ))
    except Exception:
        pass

    return _match_to_out(match, player.id)


@arena_router.post("/{match_id}/forfeit", response_model=ArenaMatchOut)
async def post_forfeit(
    match_id: int,
    user: CurrentUser,
    db: DbSession,
) -> ArenaMatchOut:
    _, player = await _resolve_player(db, user.id)
    try:
        match = await arena_service.forfeit(db, player, match_id)
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return _match_to_out(match, player.id)


# ---------------------------------------------------------------------------
# Input intent
# ---------------------------------------------------------------------------


@arena_router.post("/{match_id}/input", response_model=ArenaInputResult)
async def post_input(
    match_id: int,
    payload: ArenaInputRequest,
    user: CurrentUser,
    db: DbSession,
) -> ArenaInputResult:
    _, player = await _resolve_player(db, user.id)
    engine_match = arena_engine.get(match_id)
    if engine_match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="матч не идёт",
        )
    # Determine side from match row (engine has it too — pull from there).
    if player.id == engine_match.fighters["a"].player_id:
        side = "a"
    elif player.id == engine_match.fighters["b"].player_id:
        side = "b"
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ты не участник",
        )
    msg: dict[str, Any] = {"side": side, "type": payload.type}
    if payload.dx is not None:
        msg["dx"] = payload.dx
    if payload.height is not None:
        msg["height"] = payload.height
    if payload.slug is not None:
        msg["slug"] = payload.slug
    engine_match.push_input(msg)
    return ArenaInputResult(ok=True)


# ---------------------------------------------------------------------------
# State + WS
# ---------------------------------------------------------------------------


@arena_router.get("/{match_id}/state", response_model=ArenaStateOut)
async def get_state(
    match_id: int,
    user: CurrentUser,
    db: DbSession,
) -> ArenaStateOut:
    _, _player = await _resolve_player(db, user.id)
    engine_match = arena_engine.get(match_id)
    if engine_match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="матч не идёт",
        )
    return _engine_snapshot_to_state(engine_match.snapshot(kind="poll"))


@arena_router.websocket("/{match_id}/ws")
async def match_ws(
    ws: WebSocket,
    match_id: int,
    session_cookie: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
    token_qs: Annotated[str | None, Query(alias="token")] = None,
) -> None:
    """Stream engine state to a single client. Spectators allowed."""
    user_id: int | None = None
    token = session_cookie or token_qs
    if token:
        payload = decode_token(token)
        if payload and payload.get("type") in {"access", "refresh"}:
            try:
                user_id = int(payload.get("sub") or 0) or None
            except (TypeError, ValueError):
                user_id = None
    if user_id is None:
        await ws.close(code=4401, reason="unauthenticated")
        return

    async with SessionLocal() as db:
        event = await event_service.find_current_event(db)
        if event is None or event.status != "active":
            await ws.close(code=4404, reason="no active event")
            return
        player = (await db.execute(
            select(PrisonBreakPlayer).where(
                PrisonBreakPlayer.event_id == event.id,
                PrisonBreakPlayer.user_id == user_id,
            )
        )).scalar_one_or_none()
        if player is None:
            await ws.close(code=4403, reason="not in event")
            return

    engine_match = arena_engine.get(match_id)
    if engine_match is None:
        await ws.close(code=4404, reason="match not running")
        return

    await ws.accept()
    q = engine_match.subscribe()
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=20.0)
            except asyncio.TimeoutError:
                # Keepalive ping
                try:
                    await ws.send_text(json.dumps({"kind": "ping"}))
                    continue
                except Exception:
                    break
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                break
            if msg.get("kind") == "end":
                # Send final state and close.
                break
    except WebSocketDisconnect:
        pass
    finally:
        engine_match.unsubscribe(q)
        try:
            await ws.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Bets
# ---------------------------------------------------------------------------


@arena_router.post("/{match_id}/bet", response_model=ArenaBetOut, status_code=201)
async def post_bet(
    match_id: int,
    payload: ArenaBetRequest,
    user: CurrentUser,
    db: DbSession,
) -> ArenaBetOut:
    _, player = await _resolve_player(db, user.id)
    try:
        bet = await arena_service.place_bet(
            db, player, match_id, payload.on_player_id, payload.amount,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return ArenaBetOut(
        id=bet.id,
        match_id=bet.match_id,
        bettor_id=bet.bettor_id,
        on_player_id=bet.on_player_id,
        amount=bet.amount,
        odds=float(bet.odds),
        placed_at=bet.placed_at,
        settled_at=bet.settled_at,
        payout=bet.payout,
    )


@arena_router.get("/{match_id}/bets", response_model=list[ArenaBetOut])
async def list_bets(
    match_id: int,
    user: CurrentUser,
    db: DbSession,
) -> list[ArenaBetOut]:
    _, _ = await _resolve_player(db, user.id)
    bets = await arena_service.list_bets_for_match(db, match_id)
    return [
        ArenaBetOut(
            id=b.id,
            match_id=b.match_id,
            bettor_id=b.bettor_id,
            on_player_id=b.on_player_id,
            amount=b.amount,
            odds=float(b.odds),
            placed_at=b.placed_at,
            settled_at=b.settled_at,
            payout=b.payout,
        )
        for b in bets
    ]


# ---------------------------------------------------------------------------
# Watchdog — finalises DB row when engine reports done
# ---------------------------------------------------------------------------


async def _watch_for_finish(match_id: int) -> None:
    """Wait for the engine to finish, then persist results."""
    try:
        # Poll the engine state.
        for _ in range(800):  # ~2 minutes max
            await asyncio.sleep(0.5)
            engine_match = arena_engine.get(match_id)
            if engine_match is None:
                return
            if engine_match.finished:
                break
        else:
            # Timed out without engine reporting done — bail.
            return

        async with SessionLocal() as db:
            try:
                match = await arena_service.finalize_match(db, match_id)
                await db.commit()
            except ValueError:
                await db.rollback()
                return

        # Public WS notification
        try:
            from app.routers.prison_break.ws import BROADCASTER
            await BROADCASTER.broadcast(
                match.event_id,
                "arena_finish",
                {"match_id": match.id, "winner_id": match.winner_id},
                visibility="public",
            )
        except Exception:
            pass
    except Exception:
        # Never crash a background task.
        return
