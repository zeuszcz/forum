"""prison_break — EPIC 4 HTTP routes: intel + trust + alliance.

These three sit at the social layer of the event — intel feeds, pairwise
trust matrix, and formal alliance pacts. They share the `_resolve_player`
guard that ensures a live event + registered active player.

Endpoints:
  GET   /api/event/prison-break/intel              -- my intel feed
  POST  /api/event/prison-break/intel/forward      -- forward to another player
  POST  /api/event/prison-break/admin/intel/distribute  -- daily generator (admin)

  GET   /api/event/prison-break/trust              -- my trust matrix
  GET   /api/event/prison-break/trust/history      -- trust-impacting events
  POST  /api/event/prison-break/trust/action       -- gift/vouch/slap

  GET    /api/event/prison-break/alliances         -- my pacts
  POST   /api/event/prison-break/alliances         -- propose new
  POST   /api/event/prison-break/alliances/{id}/sign
  POST   /api/event/prison-break/alliances/{id}/cancel
  POST   /api/event/prison-break/alliances/{id}/break
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakPlayer,
)
from app.schemas.prison_break import (
    AdminIntelDistributeResult,
    AllianceActionResult,
    AllianceOut,
    AllianceProposeRequest,
    IntelForwardRequest,
    IntelForwardResult,
    IntelItem,
    TrustActionRequest,
    TrustActionResult,
    TrustEdgeOut,
    TrustHistoryEntry,
)
from app.services import auth as auth_service
from app.services.prison_break import (
    alliance_service,
    event_service,
    intel_service,
    trust_service,
)


social_router = APIRouter(prefix="/api/event/prison-break", tags=["prison_break_social"])


# ---------------------------------------------------------------------------
# Helper — same shape as actions._resolve_player
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


async def _require_staff(db, user) -> None:
    roles = await auth_service.get_user_roles(db, user.id)
    if not any(getattr(r, "is_staff", False) for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов",
        )


# ---------------------------------------------------------------------------
# Intel
# ---------------------------------------------------------------------------


@social_router.get("/intel", response_model=list[IntelItem])
async def get_intel(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    reveal_truth: bool = Query(default=False),
) -> list[IntelItem]:
    _, player = await _resolve_player(db, user.id)
    # Truth revelation is gated — only staff or the post-finale Reveal phase.
    if reveal_truth:
        roles = await auth_service.get_user_roles(db, user.id)
        is_staff = any(getattr(r, "is_staff", False) for r in roles)
        if not is_staff:
            reveal_truth = False
    items = await intel_service.list_for_player(
        db, player, limit=limit, reveal_truth=reveal_truth,
    )
    return [
        IntelItem(
            intel_id=i.intel_id,
            content=i.content,
            category=i.category,
            received_at=i.received_at,
            forwarded_from_id=i.forwarded_from_id,
            is_truth=i.is_truth,
            fabricated=i.fabricated,
            source_role=i.source_role,
        )
        for i in items
    ]


@social_router.post("/intel/forward", response_model=IntelForwardResult)
async def post_intel_forward(
    payload: IntelForwardRequest,
    user: CurrentUser,
    db: DbSession,
) -> IntelForwardResult:
    _, player = await _resolve_player(db, user.id)
    if player.ap_current < 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Нужен 1 AP, у тебя {player.ap_current}.",
        )
    try:
        view = await intel_service.forward_to(
            db, player, payload.intel_id, payload.target_player_id,
        )
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    # Spend AP + audit log (mirror action_service pattern).
    player.ap_current = max(0, player.ap_current - 1)
    db.add(PrisonBreakAction(
        event_id=player.event_id,
        actor_id=player.id,
        target_id=payload.target_player_id,
        action_type="intel_forward",
        ap_spent=1,
        success=True,
        extra={"intel_id": payload.intel_id, "trust_delta": 2},
    ))

    # Pull updated trust score for surface in response.
    a, b = sorted([player.id, payload.target_player_id])
    from app.models.prison_break import PrisonBreakTrust
    tr = (await db.execute(
        select(PrisonBreakTrust).where(
            PrisonBreakTrust.event_id == player.event_id,
            PrisonBreakTrust.user_a == a,
            PrisonBreakTrust.user_b == b,
        )
    )).scalar_one_or_none()

    await db.commit()

    # Best-effort WS push
    try:
        from app.routers.prison_break.ws import BROADCASTER
        import asyncio as _aio
        _aio.create_task(BROADCASTER.broadcast(
            player.event_id,
            "intel_forwarded",
            {
                "intel_id": payload.intel_id,
                "from_id": player.id,
                "to_id": payload.target_player_id,
            },
            visibility="private",
            actor_id=player.id,
            target_id=payload.target_player_id,
        ))
    except Exception:
        pass

    return IntelForwardResult(
        ok=True,
        delivered_to=payload.target_player_id,
        trust_now=(tr.score if tr else None),
        ap_spent=1,
        ap_remaining=player.ap_current,
    )


@social_router.post("/admin/intel/distribute", response_model=AdminIntelDistributeResult)
async def admin_intel_distribute(
    user: CurrentUser,
    db: DbSession,
) -> AdminIntelDistributeResult:
    """Force a daily intel-generation pass. Idempotent within the same day."""
    await _require_staff(db, user)
    event = await event_service.find_current_event(db)
    if event is None or event.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Нет активного сезона.",
        )
    result = await intel_service.daily_distribute(db, event)
    await db.commit()
    return AdminIntelDistributeResult(
        ok=True,
        generated=result["generated"],
        delivered=result["delivered"],
    )


# ---------------------------------------------------------------------------
# Trust
# ---------------------------------------------------------------------------


@social_router.get("/trust", response_model=list[TrustEdgeOut])
async def get_trust(
    user: CurrentUser,
    db: DbSession,
) -> list[TrustEdgeOut]:
    _, player = await _resolve_player(db, user.id)
    edges = await trust_service.list_for_player(db, player)
    return [
        TrustEdgeOut(
            other_id=e.other_id,
            other_nickname=e.other_nickname,
            score=e.score,
            last_change_at=e.last_change_at,
        )
        for e in edges
    ]


@social_router.get("/trust/history", response_model=list[TrustHistoryEntry])
async def get_trust_history(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[TrustHistoryEntry]:
    _, player = await _resolve_player(db, user.id)
    events = await trust_service.list_history(db, player, limit=limit)
    return [
        TrustHistoryEntry(
            at=e.at,
            action_type=e.action_type,
            actor_id=e.actor_id,
            actor_nickname=e.actor_nickname,
            target_id=e.target_id,
            target_nickname=e.target_nickname,
            delta=e.delta,
            score_after=e.score_after,
        )
        for e in events
    ]


@social_router.post("/trust/action", response_model=TrustActionResult)
async def post_trust_action(
    payload: TrustActionRequest,
    user: CurrentUser,
    db: DbSession,
) -> TrustActionResult:
    _, player = await _resolve_player(db, user.id)
    try:
        tr, score = await trust_service.voluntary_trust_action(
            db, player, payload.target_player_id, payload.kind,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return TrustActionResult(
        ok=True,
        kind=payload.kind,
        target_id=payload.target_player_id,
        score=score,
        ap_spent=trust_service.VOLUNTARY_AP_COST[payload.kind],
        ap_remaining=player.ap_current,
    )


# ---------------------------------------------------------------------------
# Alliance
# ---------------------------------------------------------------------------


def _alliance_to_out(a, viewer_id: int) -> AllianceOut:
    terms = dict(a.terms or {})
    sigs = list(terms.get("signatures") or [])
    required = list(terms.get("required_signers") or a.parties or [])
    return AllianceOut(
        id=a.id,
        parties=list(a.parties or []),
        pact_type=a.pact_type,
        terms=terms,
        status=a.status,
        proposed_at=a.proposed_at,
        signed_at=a.signed_at,
        expires_at=a.expires_at,
        broken_at=a.broken_at,
        broken_by_id=a.broken_by_id,
        signatures=sigs,
        required_signers=required,
        is_signed_by_me=viewer_id in sigs,
    )


@social_router.get("/alliances", response_model=list[AllianceOut])
async def list_alliances(
    user: CurrentUser,
    db: DbSession,
) -> list[AllianceOut]:
    event, player = await _resolve_player(db, user.id)
    # Auto-expire any due active pacts.
    expired_n = await alliance_service.expire_due(db, event.id)
    if expired_n:
        await db.commit()
    alliances = await alliance_service.list_visible_to(db, player)
    return [_alliance_to_out(a, player.id) for a in alliances]


@social_router.post(
    "/alliances", response_model=AllianceOut, status_code=status.HTTP_201_CREATED,
)
async def propose_alliance(
    payload: AllianceProposeRequest,
    user: CurrentUser,
    db: DbSession,
) -> AllianceOut:
    _, player = await _resolve_player(db, user.id)
    try:
        alliance = await alliance_service.propose(
            db,
            proposer=player,
            parties=payload.parties,
            pact_type=payload.pact_type,
            terms=payload.terms,
            duration_days=payload.duration_days,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    # WS push to other parties (best-effort)
    try:
        from app.routers.prison_break.ws import BROADCASTER
        import asyncio as _aio
        for pid in alliance.parties or []:
            if pid == player.id:
                continue
            _aio.create_task(BROADCASTER.broadcast(
                player.event_id,
                "alliance_proposed",
                {"alliance_id": alliance.id, "proposer_id": player.id},
                visibility="private",
                actor_id=player.id,
                target_id=pid,
            ))
    except Exception:
        pass

    return _alliance_to_out(alliance, player.id)


@social_router.post("/alliances/{alliance_id}/sign", response_model=AllianceActionResult)
async def sign_alliance(
    alliance_id: int,
    user: CurrentUser,
    db: DbSession,
) -> AllianceActionResult:
    _, player = await _resolve_player(db, user.id)
    try:
        alliance = await alliance_service.sign(db, player, alliance_id)
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    if alliance.status == "active":
        try:
            from app.routers.prison_break.ws import BROADCASTER
            import asyncio as _aio
            for pid in alliance.parties or []:
                _aio.create_task(BROADCASTER.broadcast(
                    player.event_id,
                    "alliance_activated",
                    {"alliance_id": alliance.id},
                    visibility="private",
                    actor_id=pid,
                    target_id=pid,
                ))
        except Exception:
            pass

    return AllianceActionResult(
        ok=True,
        alliance_id=alliance.id,
        new_status=alliance.status,
        message=(
            "Альянс активирован!" if alliance.status == "active"
            else "Подпись принята, ждём остальных."
        ),
    )


@social_router.post("/alliances/{alliance_id}/cancel", response_model=AllianceActionResult)
async def cancel_alliance(
    alliance_id: int,
    user: CurrentUser,
    db: DbSession,
) -> AllianceActionResult:
    _, player = await _resolve_player(db, user.id)
    try:
        alliance = await alliance_service.cancel(db, player, alliance_id)
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return AllianceActionResult(
        ok=True,
        alliance_id=alliance.id,
        new_status=alliance.status,
        message="Пакт отменён.",
    )


@social_router.post("/alliances/{alliance_id}/break", response_model=AllianceActionResult)
async def break_alliance(
    alliance_id: int,
    user: CurrentUser,
    db: DbSession,
) -> AllianceActionResult:
    _, player = await _resolve_player(db, user.id)
    try:
        alliance, affected = await alliance_service.break_pact(
            db, player, alliance_id,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    # Push notification to all affected parties.
    try:
        from app.routers.prison_break.ws import BROADCASTER
        import asyncio as _aio
        for pid in affected:
            _aio.create_task(BROADCASTER.broadcast(
                player.event_id,
                "alliance_broken",
                {
                    "alliance_id": alliance.id,
                    "broken_by_id": player.id,
                    "trust_delta": -15,
                },
                visibility="private",
                actor_id=player.id,
                target_id=pid,
            ))
    except Exception:
        pass

    return AllianceActionResult(
        ok=True,
        alliance_id=alliance.id,
        new_status=alliance.status,
        message=f"Пакт нарушен. -15 trust с {len(affected)} участниками.",
    )
