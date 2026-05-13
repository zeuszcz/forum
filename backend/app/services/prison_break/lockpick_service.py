"""prison_break — lock-pick pin-tumbler mini-game.

Concept:
  1. Player picks a target cell (any cell in any block — even cross-block).
  2. Consumes one `forged_key` from inventory + 2 AP.
  3. Server rolls a `pin_sequence`: list of integers in [0..N-1] where N is
     difficulty (3..7). The pin order is hidden from the client.
  4. Client taps one pin at a time. Server compares with `pin_sequence[current_pin]`.
     * Correct pin → advance current_pin.
     * Wrong pin → misses += 1. If misses > forgive_misses, session = lost.
  5. When current_pin == difficulty, session = won.
  6. On win:
     * Actor moves to the target cell (cell_id update).
     * If the cell was at high tunnel progress, the actor inherits the
       progress visibility — but the cell occupant set is recomputed.
     * +5 trust with every existing cellmate (broke into trust circle).
  7. On loss:
     * 50% chance the cell guard catches the actor → carcer for 6h.
     * Audit row spawns an intel atom: "Кто-то ломал замок камеры X-Y".

Item interplay:
  * Master-quality forged_key → forgive_misses = 2.
  * Good-quality forged_key  → forgive_misses = 1.
  * Crooked-quality forged_key → forgive_misses = 0 AND difficulty +1.

Difficulty heuristic:
  difficulty = 3 + clamp(cell.tunnel_progress // 25, 0, 4) (max 7)
  — higher progress means more lock layers because tunnels disturb hinges.

Anti-grief:
  * Player can have at most ONE active session at any time (DB partial
    unique index enforces this).
  * `target_cell_id` must NOT be the actor's own cell.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakCell,
    PrisonBreakInventory,
    PrisonBreakPlayer,
)
from app.models.prison_break.extras import (
    PrisonBreakEventLog,
    PrisonBreakLockpickSession,
)
from app.services.prison_break.trust_service import adjust as adjust_trust


AP_COST_START = 2
KEY_ITEM = "forged_key"

QUALITY_TO_FORGIVE: dict[str, int] = {
    "master": 2,
    "good": 1,
    "crooked": 0,
}


def _difficulty_for(cell: PrisonBreakCell) -> int:
    base = 3
    bump = max(0, min(4, cell.tunnel_progress // 25))
    return min(7, base + bump)


# ---------------------------------------------------------------------------
# Start / abandon
# ---------------------------------------------------------------------------


async def start_session(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    target_cell_id: int,
) -> PrisonBreakLockpickSession:
    """Start a pin-tumbler session. Consumes 1 forged_key + 2 AP."""
    if actor.ap_current < AP_COST_START:
        raise PermissionError(
            f"нужно {AP_COST_START} AP, у тебя {actor.ap_current}"
        )

    target = (await db.execute(
        select(PrisonBreakCell).where(
            PrisonBreakCell.id == target_cell_id,
            PrisonBreakCell.event_id == actor.event_id,
        )
    )).scalar_one_or_none()
    if target is None:
        raise ValueError("камера не найдена")
    if target.id == actor.cell_id:
        raise ValueError("нельзя ломать собственную камеру")

    # Find a forged_key in inventory.
    key = (await db.execute(
        select(PrisonBreakInventory).where(
            PrisonBreakInventory.owner_id == actor.id,
            PrisonBreakInventory.item_type == KEY_ITEM,
        ).limit(1)
    )).scalar_one_or_none()
    if key is None:
        raise PermissionError("нужен поддельный ключ — скрафти в мастерской")

    # Reject if there's already an active session for this actor.
    existing = (await db.execute(
        select(PrisonBreakLockpickSession).where(
            PrisonBreakLockpickSession.actor_id == actor.id,
            PrisonBreakLockpickSession.status == "active",
        )
    )).scalar_one_or_none()
    if existing is not None:
        raise ValueError(
            f"у тебя уже активный замок (сессия {existing.id})"
        )

    difficulty = _difficulty_for(target)
    forgive = QUALITY_TO_FORGIVE.get(key.quality, 1)
    if key.quality == "crooked":
        difficulty = min(7, difficulty + 1)

    # Consume the key.
    await db.delete(key)
    # Spend AP.
    actor.ap_current = max(0, actor.ap_current - AP_COST_START)

    pin_order = list(range(difficulty))
    random.shuffle(pin_order)

    session = PrisonBreakLockpickSession(
        event_id=actor.event_id,
        actor_id=actor.id,
        target_cell_id=target.id,
        difficulty=difficulty,
        pin_sequence=pin_order,
        key_quality=key.quality,
        forgive_misses=forgive,
        current_pin=0,
        misses=0,
        status="active",
    )
    db.add(session)
    await db.flush()

    db.add(PrisonBreakAction(
        event_id=actor.event_id,
        actor_id=actor.id,
        target_id=None,
        action_type="lockpick_start",
        ap_spent=AP_COST_START,
        success=True,
        extra={
            "session_id": session.id,
            "target_cell_id": target.id,
            "difficulty": difficulty,
            "quality": key.quality,
        },
    ))
    return session


async def abandon_session(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    session_id: int,
) -> PrisonBreakLockpickSession:
    """Player gives up. Status → abandoned, no further side-effects."""
    s = await _get_owned_session(db, actor, session_id)
    if s.status != "active":
        return s
    s.status = "abandoned"
    s.ended_at = datetime.now(UTC)
    return s


# ---------------------------------------------------------------------------
# Tap submission
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TapResult:
    correct: bool
    current_pin: int
    misses: int
    forgive_misses: int
    status: str
    outcome: dict[str, Any]


async def submit_tap(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    session_id: int,
    pin_pick: int,
) -> TapResult:
    """Submit one pin pick. Returns whether it was correct + new state."""
    s = await _get_owned_session(db, actor, session_id)
    if s.status != "active":
        raise ValueError(f"сессия уже {s.status}")
    if not (0 <= pin_pick < s.difficulty):
        raise ValueError("pin_pick out of range")

    expected = s.pin_sequence[s.current_pin]
    correct = pin_pick == expected
    if correct:
        s.current_pin += 1
    else:
        s.misses += 1

    # Check win/loss
    if s.current_pin >= s.difficulty:
        s.status = "won"
        s.ended_at = datetime.now(UTC)
        outcome = await _resolve_win(db, actor, s)
        s.outcome = outcome
        return TapResult(
            correct=True,
            current_pin=s.current_pin,
            misses=s.misses,
            forgive_misses=s.forgive_misses,
            status="won",
            outcome=outcome,
        )
    if s.misses > s.forgive_misses:
        s.status = "lost"
        s.ended_at = datetime.now(UTC)
        outcome = await _resolve_loss(db, actor, s)
        s.outcome = outcome
        return TapResult(
            correct=False,
            current_pin=s.current_pin,
            misses=s.misses,
            forgive_misses=s.forgive_misses,
            status="lost",
            outcome=outcome,
        )
    return TapResult(
        correct=correct,
        current_pin=s.current_pin,
        misses=s.misses,
        forgive_misses=s.forgive_misses,
        status="active",
        outcome={},
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


async def _get_owned_session(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    session_id: int,
) -> PrisonBreakLockpickSession:
    s = (await db.execute(
        select(PrisonBreakLockpickSession).where(
            PrisonBreakLockpickSession.id == session_id,
            PrisonBreakLockpickSession.actor_id == actor.id,
        )
    )).scalar_one_or_none()
    if s is None:
        raise ValueError("сессия не найдена")
    return s


async def _resolve_win(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    s: PrisonBreakLockpickSession,
) -> dict[str, Any]:
    """Move actor to target cell, bump trust with new cellmates."""
    old_cell = actor.cell_id
    actor.cell_id = s.target_cell_id
    target_cell = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.id == s.target_cell_id)
    )).scalar_one_or_none()
    new_block = target_cell.block if target_cell else actor.block
    actor.block = new_block

    cellmates = (await db.execute(
        select(PrisonBreakPlayer.id).where(
            PrisonBreakPlayer.cell_id == s.target_cell_id,
            PrisonBreakPlayer.id != actor.id,
        )
    )).scalars().all()

    for other in cellmates:
        await adjust_trust(db, actor.event_id, actor.id, other, delta=5)

    db.add(PrisonBreakEventLog(
        event_id=actor.event_id,
        kind="lockpick_won",
        visibility="cell",
        actor_id=actor.id,
        payload={
            "session_id": s.id,
            "from_cell_id": old_cell,
            "to_cell_id": s.target_cell_id,
            "trust_bumped_with": list(cellmates),
        },
    ))
    db.add(PrisonBreakAction(
        event_id=actor.event_id,
        actor_id=actor.id,
        target_id=None,
        action_type="lockpick_won",
        ap_spent=0,
        success=True,
        extra={
            "session_id": s.id,
            "target_cell_id": s.target_cell_id,
            "old_cell_id": old_cell,
        },
    ))
    return {
        "moved_to_cell_id": s.target_cell_id,
        "moved_to_block": new_block,
        "trust_bumped_with": list(cellmates),
    }


async def _resolve_loss(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    s: PrisonBreakLockpickSession,
) -> dict[str, Any]:
    """50% chance: caught + 6h carcer. Always: intel atom about noise."""
    caught = random.random() < 0.5
    extra: dict[str, Any] = {"caught": caught}

    if caught:
        # Lock actor's current cell (carcer proxy) for 6 hours.
        if actor.cell_id is not None:
            cell = (await db.execute(
                select(PrisonBreakCell).where(PrisonBreakCell.id == actor.cell_id)
            )).scalar_one_or_none()
            if cell is not None:
                now = datetime.now(UTC)
                cell.locked_until = now + timedelta(hours=6)
                extra["carcer_until"] = cell.locked_until.isoformat()

    target_cell = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.id == s.target_cell_id)
    )).scalar_one_or_none()

    db.add(PrisonBreakEventLog(
        event_id=actor.event_id,
        kind="lockpick_lost",
        visibility="public" if caught else "private",
        actor_id=actor.id,
        payload={
            "session_id": s.id,
            "target_cell_id": s.target_cell_id,
            "target_block": target_cell.block if target_cell else None,
            "caught": caught,
        },
    ))
    db.add(PrisonBreakAction(
        event_id=actor.event_id,
        actor_id=actor.id,
        target_id=None,
        action_type="lockpick_lost",
        ap_spent=0,
        success=False,
        extra=extra | {"session_id": s.id, "target_cell_id": s.target_cell_id},
    ))
    return extra


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


async def get_active_session(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
) -> PrisonBreakLockpickSession | None:
    return (await db.execute(
        select(PrisonBreakLockpickSession).where(
            PrisonBreakLockpickSession.actor_id == actor.id,
            PrisonBreakLockpickSession.status == "active",
        )
    )).scalar_one_or_none()


async def list_recent_sessions(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    *,
    limit: int = 10,
) -> list[PrisonBreakLockpickSession]:
    rows = await db.execute(
        select(PrisonBreakLockpickSession)
        .where(PrisonBreakLockpickSession.actor_id == actor.id)
        .order_by(PrisonBreakLockpickSession.id.desc())
        .limit(min(50, limit))
    )
    return list(rows.scalars())
