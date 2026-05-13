"""prison_break — Final Night service.

Three responsibilities:

1. Vote storage — players cast `boss / snitch / hero` votes for who
   they think holds those roles. One vote per (event, voter, kind).
2. Tally + final-outcome computation: aggregate vote counts, compare to
   the actual hidden role assignment, decide the winning side.
3. Isometric snapshot — point-in-time aggregate of cells, tunnel
   progress, player positions/states, active arena matches, recent
   reveals. Consumed by the Final Night Canvas2D broadcast.

Outcome model
─────────────
At the end of Day 21 (or admin-trigger), we compute:

  • escape_count          # of prisoners in cells with tunnel_progress >= 100
                          AND not tunnel_discovered AND status == "active"
  • escape_rate           escape_count / count(prisoners)
  • boss_correct_votes    votes where vote.kind=='boss' and target IS boss
  • boss_vote_threshold   majority of voters = correct → boss exposed

Winning side:
  • Prisoners win if escape_rate >= 0.5 AND boss NOT correctly identified
  • Guards/Authorities win if escape_rate < 0.5 OR boss correctly voted
  • Spies win iff they personally escaped (own status check)
  • Boss wins iff they personally escaped AND were not voted out

Payouts (informational; persisted in PrisonBreakReveal payload for
final_curtain):
  • +200 🪙 to each winning-side player
  • +50 🪙 bonus to the most-voted hero
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakAlliance,
    PrisonBreakArenaMatch,
    PrisonBreakCell,
    PrisonBreakEvent,
    PrisonBreakPlayer,
    PrisonBreakReveal,
)
from app.models.prison_break.extras import PrisonBreakFinalVote


VOTE_KINDS: set[str] = {"boss", "snitch", "hero"}


# ---------------------------------------------------------------------------
# Voting
# ---------------------------------------------------------------------------


async def cast_vote(
    db: AsyncSession,
    voter: PrisonBreakPlayer,
    target_player_id: int,
    kind: str,
) -> PrisonBreakFinalVote:
    if kind not in VOTE_KINDS:
        raise ValueError(f"unknown vote kind {kind!r}")
    if target_player_id == voter.id:
        raise ValueError("за себя не голосуют")
    target = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.id == target_player_id,
            PrisonBreakPlayer.event_id == voter.event_id,
        )
    )).scalar_one_or_none()
    if target is None:
        raise ValueError("игрок не найден")

    existing = (await db.execute(
        select(PrisonBreakFinalVote).where(
            PrisonBreakFinalVote.event_id == voter.event_id,
            PrisonBreakFinalVote.voter_id == voter.id,
            PrisonBreakFinalVote.kind == kind,
        )
    )).scalar_one_or_none()
    if existing is not None:
        existing.target_id = target.id
        existing.created_at = datetime.now(UTC)
        db.add(PrisonBreakAction(
            event_id=voter.event_id,
            actor_id=voter.id,
            target_id=target.id,
            action_type=f"final_vote_{kind}",
            ap_spent=0,
            success=True,
            extra={"kind": kind, "updated": True},
        ))
        return existing

    vote = PrisonBreakFinalVote(
        event_id=voter.event_id,
        voter_id=voter.id,
        target_id=target.id,
        kind=kind,
    )
    db.add(vote)
    await db.flush()
    db.add(PrisonBreakAction(
        event_id=voter.event_id,
        actor_id=voter.id,
        target_id=target.id,
        action_type=f"final_vote_{kind}",
        ap_spent=0,
        success=True,
        extra={"kind": kind, "vote_id": vote.id},
    ))
    return vote


async def my_votes(
    db: AsyncSession,
    voter: PrisonBreakPlayer,
) -> dict[str, int]:
    rows = await db.execute(
        select(PrisonBreakFinalVote.kind, PrisonBreakFinalVote.target_id).where(
            PrisonBreakFinalVote.event_id == voter.event_id,
            PrisonBreakFinalVote.voter_id == voter.id,
        )
    )
    return {kind: target for kind, target in rows.all()}


async def tally(
    db: AsyncSession,
    event_id: int,
) -> dict[str, list[tuple[int, int]]]:
    """Return per-kind sorted list of (target_id, count) descending."""
    rows = await db.execute(
        select(
            PrisonBreakFinalVote.kind,
            PrisonBreakFinalVote.target_id,
            func.count(PrisonBreakFinalVote.id),
        )
        .where(PrisonBreakFinalVote.event_id == event_id)
        .group_by(PrisonBreakFinalVote.kind, PrisonBreakFinalVote.target_id)
    )
    out: dict[str, list[tuple[int, int]]] = {k: [] for k in VOTE_KINDS}
    for kind, target_id, count in rows.all():
        out.setdefault(kind, []).append((int(target_id), int(count)))
    for k in out:
        out[k].sort(key=lambda x: (-x[1], x[0]))
    return out


# ---------------------------------------------------------------------------
# Outcome
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FinalOutcome:
    escaped_player_ids: list[int]
    escape_count: int
    escape_rate: float
    boss_correct_votes: int
    boss_voter_count: int
    boss_correctly_identified: bool
    winning_side: str  # "prisoners" | "guards" | "spies" | "boss" | "draw"
    most_voted: dict[str, int]
    payouts: dict[int, int]


async def compute_final_outcome(
    db: AsyncSession,
    event: PrisonBreakEvent,
) -> FinalOutcome:
    """Compute the canonical end-state. Pure read — no mutation here."""
    # Players + boss
    players = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.event_id == event.id)
    )).scalars().all()
    by_id = {p.id: p for p in players}

    boss = next((p for p in players if p.role == "boss"), None)

    # Escape detection
    cells = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.event_id == event.id)
    )).scalars().all()
    open_cell_ids: set[int] = set()
    for c in cells:
        if (
            c.tunnel_progress >= 100
            and not c.tunnel_discovered
            and (c.locked_until is None or c.locked_until < datetime.now(UTC))
        ):
            open_cell_ids.add(c.id)

    escaped_ids = [
        p.id for p in players
        if p.status == "active" and p.cell_id in open_cell_ids
        and p.role in ("prisoner", "authority", "spy", "boss")
    ]
    prisoner_total = sum(
        1 for p in players
        if p.role in ("prisoner", "authority")
    )
    escape_rate = (
        len(escaped_ids) / max(1, prisoner_total)
        if prisoner_total else 0.0
    )

    # Tally votes
    tallies = await tally(db, event.id)
    boss_votes = tallies.get("boss", [])
    boss_voter_count = (await db.execute(
        select(func.count()).select_from(PrisonBreakFinalVote).where(
            PrisonBreakFinalVote.event_id == event.id,
            PrisonBreakFinalVote.kind == "boss",
        )
    )).scalar() or 0

    boss_correct_votes = 0
    if boss is not None:
        for target_id, count in boss_votes:
            if target_id == boss.id:
                boss_correct_votes = count
                break
    boss_correctly_identified = (
        boss is not None
        and boss_voter_count > 0
        and boss_correct_votes * 2 > boss_voter_count
    )

    # Side resolution
    boss_escaped = boss is not None and boss.id in escaped_ids
    if escape_rate >= 0.5 and not boss_correctly_identified:
        winning_side = "prisoners"
    elif boss_correctly_identified and boss is not None and not boss_escaped:
        winning_side = "guards"
    elif boss_escaped and not boss_correctly_identified:
        winning_side = "boss"
    elif escape_rate >= 0.3:
        winning_side = "prisoners"
    else:
        winning_side = "guards"

    # Spies — independent win condition
    spies_escaped = [
        p.id for p in players
        if p.role == "spy" and p.id in escaped_ids
    ]
    # We mark spies as a parallel-win category — not exclusive.

    most_voted: dict[str, int] = {}
    for kind in VOTE_KINDS:
        rows = tallies.get(kind, [])
        if rows:
            most_voted[kind] = rows[0][0]

    # Payouts
    payouts: dict[int, int] = {}
    for p in players:
        if winning_side == "prisoners" and p.role in ("prisoner", "authority"):
            payouts[p.id] = payouts.get(p.id, 0) + 200
        elif winning_side == "guards" and p.role in ("guard", "authority"):
            payouts[p.id] = payouts.get(p.id, 0) + 200
        elif winning_side == "boss" and p.role == "boss":
            payouts[p.id] = payouts.get(p.id, 0) + 500
    for sid in spies_escaped:
        payouts[sid] = payouts.get(sid, 0) + 300
    hero_id = most_voted.get("hero")
    if hero_id is not None and hero_id in by_id:
        payouts[hero_id] = payouts.get(hero_id, 0) + 50

    return FinalOutcome(
        escaped_player_ids=escaped_ids,
        escape_count=len(escaped_ids),
        escape_rate=escape_rate,
        boss_correct_votes=boss_correct_votes,
        boss_voter_count=int(boss_voter_count),
        boss_correctly_identified=boss_correctly_identified,
        winning_side=winning_side,
        most_voted=most_voted,
        payouts=payouts,
    )


async def apply_payouts(
    db: AsyncSession,
    event: PrisonBreakEvent,
    payouts: dict[int, int],
) -> int:
    """Credit 🪙 to each winner. Idempotent via event.config flag."""
    cfg = dict(event.config or {})
    if cfg.get("final_payouts_applied"):
        return 0
    n = 0
    for player_id, amount in payouts.items():
        p = (await db.execute(
            select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == player_id)
        )).scalar_one_or_none()
        if p is None:
            continue
        p.money += int(amount)
        n += 1
    cfg["final_payouts_applied"] = True
    event.config = cfg
    return n


# ---------------------------------------------------------------------------
# Isometric snapshot
# ---------------------------------------------------------------------------


async def isometric_snapshot(
    db: AsyncSession,
    event: PrisonBreakEvent,
) -> dict[str, Any]:
    """Aggregate state for the Final Night Canvas2D broadcast.

    Lightweight — meant to be polled at 1 Hz or pushed via the existing
    PrisonBreakBroadcaster `arena_finish` / `daily` channels.
    """
    cells = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.event_id == event.id)
        .order_by(PrisonBreakCell.block, PrisonBreakCell.number)
    )).scalars().all()

    players = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.event_id == event.id)
    )).scalars().all()

    by_cell: dict[int, list[dict[str, Any]]] = {}
    for p in players:
        if p.cell_id is None:
            continue
        by_cell.setdefault(p.cell_id, []).append({
            "id": p.id,
            "nickname": p.nickname,
            "tattoo": p.tattoo,
            "status": p.status,
            "revealed_role": p.revealed_role,
        })

    arena_active = (await db.execute(
        select(PrisonBreakArenaMatch).where(
            PrisonBreakArenaMatch.event_id == event.id,
            PrisonBreakArenaMatch.status == "active",
        )
    )).scalars().all()

    alliances_active = (await db.execute(
        select(func.count()).select_from(PrisonBreakAlliance).where(
            PrisonBreakAlliance.event_id == event.id,
            PrisonBreakAlliance.status == "active",
        )
    )).scalar() or 0

    return {
        "event": {
            "id": event.id,
            "title": event.title,
            "season": event.season,
            "status": event.status,
            "current_day": event.current_day,
            "current_phase": event.current_phase,
        },
        "cells": [
            {
                "id": c.id,
                "block": c.block,
                "number": c.number,
                "tunnel_progress": c.tunnel_progress,
                "tunnel_discovered": c.tunnel_discovered,
                "locked_until": c.locked_until.isoformat() if c.locked_until else None,
                "members": by_cell.get(c.id, []),
            }
            for c in cells
        ],
        "guards_unassigned": [
            {
                "id": p.id,
                "nickname": p.nickname,
                "tattoo": p.tattoo,
                "block": p.block,
                "status": p.status,
                "revealed_role": p.revealed_role,
            }
            for p in players if p.cell_id is None and (p.role == "guard" or p.revealed_role == "guard")
        ],
        "arena_active": [
            {
                "id": m.id,
                "player_a_id": m.player_a_id,
                "player_b_id": m.player_b_id,
            }
            for m in arena_active
        ],
        "alliances_active": int(alliances_active),
        "ts": datetime.now(UTC).isoformat(),
    }


# ---------------------------------------------------------------------------
# Pretty-print helpers used by the router
# ---------------------------------------------------------------------------


async def vote_summary(
    db: AsyncSession,
    event_id: int,
    *,
    player_names: dict[int, str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    tallies = await tally(db, event_id)
    if player_names is None:
        rows = await db.execute(
            select(PrisonBreakPlayer.id, PrisonBreakPlayer.nickname).where(
                PrisonBreakPlayer.event_id == event_id,
            )
        )
        player_names = {pid: nick for pid, nick in rows.all()}
    out: dict[str, list[dict[str, Any]]] = {}
    for kind, items in tallies.items():
        out[kind] = [
            {
                "target_id": tid,
                "target_nickname": player_names.get(tid, f"#{tid}"),
                "count": count,
            }
            for tid, count in items
        ]
    return out
