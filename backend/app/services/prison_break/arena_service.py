"""prison_break — arena lifecycle service.

Owns the persistence side of EPIC 6: challenges, loadouts, bets.
The in-memory engine lives in `arena_engine`; this module wires the
engine in/out of `prison_break_arena_match` rows.

Flow:
    1. Player sets loadout (3 special slugs) via update_loadout().
    2. challenge(actor, opponent) creates a match row (status=pending).
    3. accept(opponent, match_id) flips it to active, instantiates an
       ArenaMatch in arena_engine, starts the tick task.
    4. Match finishes (KO or timeout) → engine sets winner; the router
       calls finalize_match() to write winner_id + replay back to DB
       and settle bets.
    5. Bets are placed while match.status == "active"; settle once
       finalize_match completes.
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakArenaBet,
    PrisonBreakArenaMatch,
    PrisonBreakPlayer,
)
from app.services.prison_break import arena_engine


LOADOUT_MIN = 3
LOADOUT_MAX = 3


# ---------------------------------------------------------------------------
# Loadout
# ---------------------------------------------------------------------------


def normalise_loadout(specials: list[str]) -> dict[str, Any]:
    """Validate + dedupe + cap loadout. Raises ValueError on bad input."""
    catalog = {s["slug"] for s in arena_engine.specials_catalog()}
    cleaned: list[str] = []
    for s in specials:
        if not isinstance(s, str):
            raise ValueError("specials must be strings")
        if s not in catalog:
            raise ValueError(f"unknown special {s!r}")
        if s not in cleaned:
            cleaned.append(s)
    if len(cleaned) < LOADOUT_MIN:
        raise ValueError(f"need {LOADOUT_MIN} distinct specials, got {len(cleaned)}")
    return {"specials": cleaned[:LOADOUT_MAX]}


async def update_loadout(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    specials: list[str],
) -> dict[str, Any]:
    new = normalise_loadout(specials)
    existing = dict(player.arena_loadout or {})
    existing.update(new)
    existing["updated_at"] = datetime.now(UTC).isoformat()
    existing.setdefault("wins", 0)
    existing.setdefault("losses", 0)
    player.arena_loadout = existing
    return existing


def get_loadout(player: PrisonBreakPlayer) -> dict[str, Any]:
    raw = dict(player.arena_loadout or {})
    raw.setdefault("specials", [])
    raw.setdefault("wins", 0)
    raw.setdefault("losses", 0)
    return raw


# ---------------------------------------------------------------------------
# Challenge / accept / decline / forfeit
# ---------------------------------------------------------------------------


async def challenge(
    db: AsyncSession,
    challenger: PrisonBreakPlayer,
    opponent_player_id: int,
) -> PrisonBreakArenaMatch:
    if opponent_player_id == challenger.id:
        raise ValueError("себя не вызвать")
    opponent = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.id == opponent_player_id,
            PrisonBreakPlayer.event_id == challenger.event_id,
            PrisonBreakPlayer.status == "active",
        )
    )).scalar_one_or_none()
    if opponent is None:
        raise ValueError("противник не найден")

    challenger_loadout = get_loadout(challenger)
    if len(challenger_loadout.get("specials", [])) < LOADOUT_MIN:
        raise PermissionError(
            "сначала собери loadout из 3 приёмов"
        )

    # No double-pending challenges between same pair.
    existing = (await db.execute(
        select(PrisonBreakArenaMatch).where(
            PrisonBreakArenaMatch.event_id == challenger.event_id,
            PrisonBreakArenaMatch.status.in_(["pending", "active"]),
            (
                (
                    (PrisonBreakArenaMatch.player_a_id == challenger.id)
                    & (PrisonBreakArenaMatch.player_b_id == opponent.id)
                )
                | (
                    (PrisonBreakArenaMatch.player_a_id == opponent.id)
                    & (PrisonBreakArenaMatch.player_b_id == challenger.id)
                )
            ),
        )
    )).scalar_one_or_none()
    if existing is not None:
        raise ValueError(
            f"уже есть {existing.status} матч (id={existing.id})"
        )

    match = PrisonBreakArenaMatch(
        event_id=challenger.event_id,
        player_a_id=challenger.id,
        player_b_id=opponent.id,
        status="pending",
        replay={
            "meta": {
                "challenged_at": datetime.now(UTC).isoformat(),
                "loadout_a": challenger_loadout.get("specials", []),
                "loadout_b": [],
                "challenger_id": challenger.id,
            },
        },
    )
    db.add(match)
    await db.flush()

    db.add(PrisonBreakAction(
        event_id=challenger.event_id,
        actor_id=challenger.id,
        target_id=opponent.id,
        action_type="arena_challenge",
        ap_spent=0,
        success=True,
        extra={"match_id": match.id},
    ))
    return match


async def decline(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    match_id: int,
) -> PrisonBreakArenaMatch:
    match = await _get_match(db, match_id, actor.event_id)
    if match.status != "pending":
        raise ValueError(f"match status is {match.status!r}, not pending")
    if actor.id != match.player_b_id and actor.id != match.player_a_id:
        raise PermissionError("ты не участник этого вызова")
    match.status = "cancelled"
    match.ended_at = datetime.now(UTC)
    db.add(PrisonBreakAction(
        event_id=actor.event_id,
        actor_id=actor.id,
        target_id=match.player_a_id if actor.id != match.player_a_id else match.player_b_id,
        action_type="arena_decline",
        ap_spent=0,
        success=True,
        extra={"match_id": match.id},
    ))
    return match


async def accept(
    db: AsyncSession,
    opponent: PrisonBreakPlayer,
    match_id: int,
) -> tuple[PrisonBreakArenaMatch, arena_engine.ArenaMatch]:
    match = await _get_match(db, match_id, opponent.event_id)
    if match.status != "pending":
        raise ValueError(f"match status is {match.status!r}, not pending")
    if opponent.id != match.player_b_id:
        raise PermissionError("вызов адресован не тебе")

    opp_loadout = get_loadout(opponent)
    if len(opp_loadout.get("specials", [])) < LOADOUT_MIN:
        raise PermissionError("сначала собери loadout из 3 приёмов")

    challenger = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == match.player_a_id)
    )).scalar_one()
    ch_loadout = get_loadout(challenger)

    match.status = "active"
    match.started_at = datetime.now(UTC)
    meta = dict(match.replay or {}).get("meta") or {}
    meta["loadout_b"] = opp_loadout.get("specials", [])
    meta["accepted_at"] = match.started_at.isoformat()
    match.replay = {"meta": meta, "frames": []}

    # Build engine match
    fighter_a = arena_engine.make_fighter(
        player_id=challenger.id,
        nickname=challenger.nickname,
        tattoo=challenger.tattoo,
        loadout=ch_loadout.get("specials", []),
        side="a",
    )
    fighter_b = arena_engine.make_fighter(
        player_id=opponent.id,
        nickname=opponent.nickname,
        tattoo=opponent.tattoo,
        loadout=opp_loadout.get("specials", []),
        side="b",
    )
    engine_match = arena_engine.ArenaMatch(
        match_id=match.id,
        event_id=match.event_id,
        fighter_a=fighter_a,
        fighter_b=fighter_b,
        seed=match.id * 31 + match.event_id,
    )
    arena_engine.register(engine_match)

    db.add(PrisonBreakAction(
        event_id=match.event_id,
        actor_id=opponent.id,
        target_id=challenger.id,
        action_type="arena_accept",
        ap_spent=0,
        success=True,
        extra={"match_id": match.id},
    ))
    return match, engine_match


async def forfeit(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    match_id: int,
) -> PrisonBreakArenaMatch:
    match = await _get_match(db, match_id, actor.event_id)
    if match.status != "active":
        raise ValueError(f"match status is {match.status!r}, not active")
    if actor.id not in (match.player_a_id, match.player_b_id):
        raise PermissionError("ты не участник этого матча")

    # Stop engine if running.
    engine_match = arena_engine.get(match.id)
    if engine_match is not None:
        await engine_match.stop()
        arena_engine.unregister(match.id)

    match.status = "forfeit"
    match.winner_id = match.player_b_id if actor.id == match.player_a_id else match.player_a_id
    match.ended_at = datetime.now(UTC)
    db.add(PrisonBreakAction(
        event_id=match.event_id,
        actor_id=actor.id,
        target_id=match.winner_id,
        action_type="arena_forfeit",
        ap_spent=0,
        success=True,
        extra={"match_id": match.id},
    ))
    await _bump_win_loss(db, match.winner_id, won=True)
    await _bump_win_loss(db, actor.id, won=False)
    await _settle_bets(db, match)
    return match


async def finalize_match(
    db: AsyncSession,
    match_id: int,
) -> PrisonBreakArenaMatch:
    """Engine has flagged finished — persist winner_id, replay, settle bets."""
    engine_match = arena_engine.get(match_id)
    if engine_match is None:
        raise ValueError("engine match not in registry")
    if not engine_match.finished:
        raise ValueError("engine not finished yet")

    match = (await db.execute(
        select(PrisonBreakArenaMatch).where(PrisonBreakArenaMatch.id == match_id)
    )).scalar_one()
    if match.status == "finished":
        return match  # already done

    winner_id: int | None = None
    if engine_match.winner_side == "a":
        winner_id = engine_match.fighters["a"].player_id
    elif engine_match.winner_side == "b":
        winner_id = engine_match.fighters["b"].player_id

    match.status = "finished"
    match.winner_id = winner_id
    match.ended_at = engine_match.ended_at or datetime.now(UTC)
    meta = dict(match.replay or {}).get("meta") or {}
    match.replay = {
        "meta": meta,
        "frames": engine_match.frames[-200:],  # cap to last 200 frames
        "events": [
            {"kind": e.kind, "tick": e.tick, "payload": e.payload}
            for e in engine_match.events
        ],
    }

    db.add(PrisonBreakAction(
        event_id=match.event_id,
        actor_id=winner_id or match.player_a_id,
        target_id=(
            match.player_b_id if winner_id == match.player_a_id
            else match.player_a_id
        ),
        action_type="arena_finish",
        ap_spent=0,
        success=True,
        extra={
            "match_id": match.id,
            "winner_id": winner_id,
            "frames": len(engine_match.frames),
        },
    ))

    if winner_id is not None:
        loser_id = (
            match.player_b_id if winner_id == match.player_a_id
            else match.player_a_id
        )
        await _bump_win_loss(db, winner_id, won=True)
        await _bump_win_loss(db, loser_id, won=False)
    await _settle_bets(db, match)

    arena_engine.unregister(match_id)
    return match


# ---------------------------------------------------------------------------
# Betting
# ---------------------------------------------------------------------------


async def place_bet(
    db: AsyncSession,
    bettor: PrisonBreakPlayer,
    match_id: int,
    on_player_id: int,
    amount: int,
) -> PrisonBreakArenaBet:
    if amount < 1:
        raise ValueError("ставка должна быть положительной")
    if bettor.money < amount:
        raise ValueError("недостаточно денег")
    match = await _get_match(db, match_id, bettor.event_id)
    if match.status != "active":
        raise ValueError("ставку можно поставить только на активный матч")
    if on_player_id not in (match.player_a_id, match.player_b_id):
        raise ValueError("on_player_id не участник")
    if bettor.id in (match.player_a_id, match.player_b_id):
        raise ValueError("участники не ставят")

    # Compute odds — proportional to existing pool. Simple: 1.95 fixed for v1.
    odds = Decimal("1.95")
    bettor.money -= amount
    bet = PrisonBreakArenaBet(
        match_id=match.id,
        bettor_id=bettor.id,
        on_player_id=on_player_id,
        amount=amount,
        odds=odds,
    )
    db.add(bet)
    await db.flush()
    return bet


async def _settle_bets(
    db: AsyncSession,
    match: PrisonBreakArenaMatch,
) -> None:
    if match.winner_id is None:
        # No winner — refund all stakes.
        bets = (await db.execute(
            select(PrisonBreakArenaBet).where(
                PrisonBreakArenaBet.match_id == match.id,
                PrisonBreakArenaBet.settled_at.is_(None),
            )
        )).scalars().all()
        for b in bets:
            bettor = (await db.execute(
                select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == b.bettor_id)
            )).scalar_one()
            bettor.money += b.amount
            b.settled_at = datetime.now(UTC)
            b.payout = b.amount
        return

    bets = (await db.execute(
        select(PrisonBreakArenaBet).where(
            PrisonBreakArenaBet.match_id == match.id,
            PrisonBreakArenaBet.settled_at.is_(None),
        )
    )).scalars().all()
    now = datetime.now(UTC)
    for b in bets:
        bettor = (await db.execute(
            select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == b.bettor_id)
        )).scalar_one()
        if b.on_player_id == match.winner_id:
            payout = int(b.amount * float(b.odds))
            bettor.money += payout
            b.payout = payout
        else:
            b.payout = 0
        b.settled_at = now


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def list_active(
    db: AsyncSession,
    event_id: int,
) -> list[PrisonBreakArenaMatch]:
    rows = await db.execute(
        select(PrisonBreakArenaMatch)
        .where(
            PrisonBreakArenaMatch.event_id == event_id,
            PrisonBreakArenaMatch.status.in_(["pending", "active"]),
        )
        .order_by(PrisonBreakArenaMatch.id.desc())
        .limit(40)
    )
    return list(rows.scalars())


async def list_history(
    db: AsyncSession,
    event_id: int,
    *,
    limit: int = 20,
) -> list[PrisonBreakArenaMatch]:
    rows = await db.execute(
        select(PrisonBreakArenaMatch)
        .where(
            PrisonBreakArenaMatch.event_id == event_id,
            PrisonBreakArenaMatch.status.in_(["finished", "forfeit", "cancelled"]),
        )
        .order_by(PrisonBreakArenaMatch.id.desc())
        .limit(min(60, limit))
    )
    return list(rows.scalars())


async def list_bets_for_match(
    db: AsyncSession,
    match_id: int,
) -> list[PrisonBreakArenaBet]:
    rows = await db.execute(
        select(PrisonBreakArenaBet)
        .where(PrisonBreakArenaBet.match_id == match_id)
        .order_by(PrisonBreakArenaBet.id.asc())
    )
    return list(rows.scalars())


async def list_bets_for_player(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    *,
    limit: int = 30,
) -> list[PrisonBreakArenaBet]:
    rows = await db.execute(
        select(PrisonBreakArenaBet)
        .where(PrisonBreakArenaBet.bettor_id == player.id)
        .order_by(PrisonBreakArenaBet.id.desc())
        .limit(min(60, limit))
    )
    return list(rows.scalars())


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


async def _get_match(
    db: AsyncSession,
    match_id: int,
    event_id: int,
) -> PrisonBreakArenaMatch:
    m = (await db.execute(
        select(PrisonBreakArenaMatch).where(
            PrisonBreakArenaMatch.id == match_id,
            PrisonBreakArenaMatch.event_id == event_id,
        )
    )).scalar_one_or_none()
    if m is None:
        raise ValueError("матч не найден")
    return m


async def _bump_win_loss(
    db: AsyncSession,
    player_id: int,
    *,
    won: bool,
) -> None:
    p = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == player_id)
    )).scalar_one_or_none()
    if p is None:
        return
    loadout = dict(p.arena_loadout or {})
    if won:
        loadout["wins"] = int(loadout.get("wins", 0)) + 1
    else:
        loadout["losses"] = int(loadout.get("losses", 0)) + 1
    p.arena_loadout = loadout
