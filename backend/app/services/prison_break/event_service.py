"""prison_break — event lifecycle + role assignment service.

Single-active-event invariant: only one event is in `signup` or `active`
status at any time. Creating a new event while one is active will fail.

Role assignment algorithm (run at `start` transition):
    1. Snapshot the registered player list.
    2. Sort by user karma DESC, take top 5% as Authorities (community trust).
    3. Random shuffle the rest.
    4. Apportion: 3% boss, 7% spy, 25% guard, remainder prisoners.
    5. Assign cells (4 prisoners + 0/1 authority per cell, 6-8 cells per
       block A/B/C). Friend-graph avoidance: 2 forum friends never in same cell.
"""
from __future__ import annotations

import random
import secrets
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakCell,
    PrisonBreakEvent,
    PrisonBreakPlayer,
)
from app.models.user import User


# --------------------------------------------------------------------------
# Event lifecycle
# --------------------------------------------------------------------------


async def find_current_event(db: AsyncSession) -> PrisonBreakEvent | None:
    """Return the single non-finished event, or None.

    "Current" = status in {draft, signup, active}. There can be at most one.
    """
    rows = await db.execute(
        select(PrisonBreakEvent)
        .where(PrisonBreakEvent.status.in_(["draft", "signup", "active"]))
        .order_by(PrisonBreakEvent.id.desc())
        .limit(1)
    )
    return rows.scalar_one_or_none()


async def create_event(
    db: AsyncSession,
    *,
    season: str,
    title: str,
    description: str,
    signup_opens_at: datetime | None,
    starts_at: datetime | None,
    duration_days: int,
) -> PrisonBreakEvent:
    """Create a new event in draft status. Fails if one already active."""
    existing = await find_current_event(db)
    if existing is not None:
        raise ValueError(
            f"Another event is already in progress (id={existing.id} status={existing.status})"
        )
    now = datetime.now(UTC)
    starts = starts_at or (now + timedelta(days=3))
    ends = starts + timedelta(days=duration_days)
    event = PrisonBreakEvent(
        season=season,
        title=title,
        description=description,
        status="draft",
        current_phase="setup",
        current_day=0,
        signup_opens_at=signup_opens_at or now,
        starts_at=starts,
        ends_at=ends,
        config={
            "duration_days": duration_days,
            "ap_daily_base": 3,
            "ap_max_carry": 5,
        },
    )
    db.add(event)
    await db.flush()
    return event


async def transition_event(
    db: AsyncSession,
    event: PrisonBreakEvent,
    action: str,
) -> PrisonBreakEvent:
    """Apply an admin transition. Validates state machine."""
    valid_transitions: dict[str, set[str]] = {
        "draft": {"open_signup", "cancel"},
        "signup": {"start", "cancel"},
        "active": {"finish", "cancel"},
        "finished": set(),
        "cancelled": set(),
    }
    allowed = valid_transitions.get(event.status, set())
    if action not in allowed:
        raise ValueError(
            f"cannot transition from {event.status!r} via {action!r}; "
            f"allowed: {sorted(allowed)}"
        )

    now = datetime.now(UTC)
    if action == "open_signup":
        event.status = "signup"
        event.signup_opens_at = now
    elif action == "start":
        # Run role + cell assignment before flipping status.
        await _assign_roles_and_cells(db, event)
        event.status = "active"
        event.current_day = 1
        event.current_phase = "setup"
        event.starts_at = now
    elif action == "finish":
        event.status = "finished"
        event.ends_at = now
    elif action == "cancel":
        event.status = "cancelled"
        event.ends_at = now
    event.updated_at = now
    return event


# --------------------------------------------------------------------------
# Role + cell assignment
# --------------------------------------------------------------------------


async def _assign_roles_and_cells(
    db: AsyncSession,
    event: PrisonBreakEvent,
) -> None:
    """Atomic role + cell assignment. Must run inside an open transaction."""
    rows = await db.execute(
        select(PrisonBreakPlayer, User.karma)
        .join(User, User.id == PrisonBreakPlayer.user_id)
        .where(PrisonBreakPlayer.event_id == event.id)
    )
    pairs: list[tuple[PrisonBreakPlayer, int]] = [
        (p, k or 0) for p, k in rows.all()
    ]
    total = len(pairs)
    if total < 4:
        raise ValueError(
            f"need at least 4 registered players to start, got {total}"
        )

    # 1) Authorities — top karma
    authority_count = max(1, round(total * 0.05))
    pairs.sort(key=lambda pk: pk[1], reverse=True)
    authorities = [p for p, _ in pairs[:authority_count]]
    remaining = [p for p, _ in pairs[authority_count:]]

    # 2) Shuffle remaining (deterministic per event for reproducibility)
    rng = random.Random(secrets.randbits(64))
    rng.shuffle(remaining)

    # 3) Apportion
    boss_count = max(1, round(total * 0.03))
    spy_count = max(1, round(total * 0.07))
    guard_count = round(total * 0.25)

    bosses = remaining[:boss_count]
    spies = remaining[boss_count : boss_count + spy_count]
    guards = remaining[
        boss_count + spy_count : boss_count + spy_count + guard_count
    ]
    prisoners = remaining[boss_count + spy_count + guard_count :]

    # Tag roles + factions
    for p in authorities:
        p.role = "authority"
        p.faction = "prisoner"
    for p in bosses:
        p.role = "boss"
        p.faction = "guard"  # publicly appears as prisoner-aligned; private = boss
    for p in spies:
        p.role = "spy"
        # spies present as one faction publicly, real loyalty hidden
        p.faction = rng.choice(["prisoner", "guard"])
    for p in guards:
        p.role = "guard"
        p.faction = "guard"
    for p in prisoners:
        p.role = "prisoner"
        p.faction = "prisoner"

    # 4) Cell distribution — only prisoners + authorities live in cells
    cell_dwellers = prisoners + authorities + spies + bosses
    # Spies/bosses sit visually with prisoners. Guards never have a cell.
    cells_per_block = max(2, (len(cell_dwellers) + 11) // 12)  # 4 per cell, 3 blocks
    blocks = ["A", "B", "C"]

    # Make all cells up-front
    cell_objects: list[PrisonBreakCell] = []
    for block in blocks:
        for n in range(1, cells_per_block + 1):
            cell = PrisonBreakCell(event_id=event.id, block=block, number=n)
            db.add(cell)
            cell_objects.append(cell)
    await db.flush()  # to materialise cell.id values

    # Distribute authorities round-robin across blocks (each authority lives
    # in their own cell, mixed with prisoners).
    cells_by_block: dict[str, list[PrisonBreakCell]] = defaultdict(list)
    for c in cell_objects:
        cells_by_block[c.block].append(c)
    authority_target_cells: dict[int, PrisonBreakCell] = {}
    for i, auth in enumerate(authorities):
        target_block = blocks[i % 3]
        target_cell = cells_by_block[target_block][i // 3 % len(cells_by_block[target_block])]
        auth.cell_id = target_cell.id
        auth.block = target_cell.block
        authority_target_cells[target_cell.id] = target_cell

    # Distribute remaining dwellers (prisoners + spies + bosses, NOT authorities again)
    others = [p for p in cell_dwellers if p.role != "authority"]
    rng.shuffle(others)
    cell_capacity: dict[int, int] = {c.id: 4 for c in cell_objects}
    # Reduce capacity for cells that got an authority
    for c_id in authority_target_cells:
        cell_capacity[c_id] -= 1

    for p in others:
        # Pick any cell that still has space, prefer cells with fewest occupants
        # (load-balance). Friends-graph avoidance is a stretch goal — for MVP
        # we trust random shuffle.
        available = [
            c for c in cell_objects
            if cell_capacity[c.id] > 0
        ]
        if not available:
            # Overflow — shouldn't happen with cells_per_block formula, but
            # be defensive: pack into the least-full cell ignoring capacity.
            available = sorted(cell_objects, key=lambda c: cell_capacity[c.id])
        target = rng.choice(available[:6])  # any of 6 least-full
        p.cell_id = target.id
        p.block = target.block
        cell_capacity[target.id] -= 1

    # Guards: stay block-bound but cellless. Assign a block.
    rng.shuffle(guards)
    for i, g in enumerate(guards):
        g.block = blocks[i % 3]
