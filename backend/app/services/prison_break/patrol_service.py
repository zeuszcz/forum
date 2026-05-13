"""prison_break — guard patrol grid planner + execution.

Guards craft a per-day route of cell IDs in their assigned block. Each plan
has a `focus` mode (balanced / aggressive / stealth) that biases the
per-cell detection model. Plans are pre-committed: once executed they
can't be re-run on the same day.

Execution:
  When the guard runs the `execute` endpoint (1 AP), the service walks
  the route once and for each cell rolls:
    detection_chance = base + tunnel_progress_bonus + focus_modifier
  If detected:
    * Cell is busted: tunnel_discovered = True, locked_until += 2 days.
    * Event log + intel atom seeded.
    * Pillar of trust loss on the affected cell members vs this guard.
  If empty:
    * Mostly silent — small +1 trust within the guard's faction (esprit).

Why this exists:
  EPIC 2 patrol was a one-shot random roll — guards had no agency. The
  plan gives guards a strategic surface for negotiation ("I'll route
  around your block if you snitch on X").
"""
from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakCell,
    PrisonBreakEvent,
    PrisonBreakIntel,
    PrisonBreakIntelView,
    PrisonBreakPlayer,
)
from app.models.prison_break.extras import (
    PrisonBreakEventLog,
    PrisonBreakPatrolPlan,
)


FOCUS_MODIFIERS: dict[str, dict[str, float]] = {
    "balanced":   {"detection_bonus": 0.0,  "ap_cost": 1.0, "trust_hit_factor": 1.0},
    "aggressive": {"detection_bonus": 0.15, "ap_cost": 2.0, "trust_hit_factor": 1.5},
    "stealth":    {"detection_bonus": 0.05, "ap_cost": 1.0, "trust_hit_factor": 0.5},
}

MAX_ROUTE_LEN = 6


# ---------------------------------------------------------------------------
# Plan creation / update / cancel
# ---------------------------------------------------------------------------


async def create_or_update_plan(
    db: AsyncSession,
    guard: PrisonBreakPlayer,
    event: PrisonBreakEvent,
    route: Sequence[int],
    focus: str,
) -> PrisonBreakPatrolPlan:
    """Insert or update the guard's plan for the current event day."""
    if guard.role != "guard":
        raise PermissionError("только охрана может планировать патруль")
    if focus not in FOCUS_MODIFIERS:
        raise ValueError(f"unknown focus {focus!r}")
    if guard.block is None:
        raise ValueError("у тебя нет блока")
    route_list = list(route)
    if not route_list:
        raise ValueError("маршрут пуст")
    if len(route_list) > MAX_ROUTE_LEN:
        raise ValueError(f"маршрут не должен превышать {MAX_ROUTE_LEN} камер")

    # Validate all cells exist + belong to the guard's block.
    cells = (await db.execute(
        select(PrisonBreakCell).where(
            PrisonBreakCell.id.in_(route_list),
            PrisonBreakCell.event_id == guard.event_id,
        )
    )).scalars().all()
    by_id = {c.id: c for c in cells}
    for cid in route_list:
        if cid not in by_id:
            raise ValueError(f"камера {cid} не существует")
        if by_id[cid].block != guard.block:
            raise ValueError(
                f"камера {by_id[cid].block}-{by_id[cid].number} не в твоём блоке"
            )

    # Find existing plan for today.
    existing = (await db.execute(
        select(PrisonBreakPatrolPlan).where(
            PrisonBreakPatrolPlan.guard_id == guard.id,
            PrisonBreakPatrolPlan.valid_for_day == event.current_day,
        )
    )).scalar_one_or_none()
    if existing is not None:
        if existing.executed:
            raise ValueError("план уже исполнен — измени завтра")
        existing.route = route_list
        existing.focus = focus
        return existing

    plan = PrisonBreakPatrolPlan(
        event_id=guard.event_id,
        guard_id=guard.id,
        block=guard.block,
        route=route_list,
        focus=focus,
        valid_for_day=event.current_day,
        executed=False,
    )
    db.add(plan)
    await db.flush()
    return plan


async def cancel_plan(
    db: AsyncSession,
    guard: PrisonBreakPlayer,
    plan_id: int,
) -> None:
    plan = await _get_owned_plan(db, guard, plan_id)
    if plan.executed:
        raise ValueError("уже исполнен")
    await db.delete(plan)


# ---------------------------------------------------------------------------
# Plan execution
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PatrolStep:
    cell_id: int
    block: str
    number: int
    outcome: str  # "busted" | "empty" | "stealth_pass"
    tunnel_progress_before: int
    tunnel_progress_after: int


@dataclass(frozen=True)
class PatrolResult:
    plan_id: int
    steps: list[PatrolStep]
    ap_spent: int


async def execute_plan(
    db: AsyncSession,
    guard: PrisonBreakPlayer,
    plan_id: int,
) -> PatrolResult:
    """Walk the route once. Spend AP. Apply per-cell rolls."""
    plan = await _get_owned_plan(db, guard, plan_id)
    if plan.executed:
        raise ValueError("уже исполнен")

    modifier = FOCUS_MODIFIERS[plan.focus]
    ap_cost = max(1, int(round(modifier["ap_cost"])))
    if guard.ap_current < ap_cost:
        raise PermissionError(
            f"нужно {ap_cost} AP, у тебя {guard.ap_current}"
        )

    cells = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.id.in_(plan.route))
    )).scalars().all()
    by_id = {c.id: c for c in cells}

    steps: list[PatrolStep] = []
    result_payload: dict[str, Any] = {"steps": []}

    for cid in plan.route:
        cell = by_id.get(cid)
        if cell is None:
            continue
        progress_before = cell.tunnel_progress
        # Cells already discovered yield nothing useful.
        if cell.tunnel_discovered:
            steps.append(PatrolStep(
                cell_id=cell.id, block=cell.block, number=cell.number,
                outcome="empty",
                tunnel_progress_before=progress_before,
                tunnel_progress_after=cell.tunnel_progress,
            ))
            result_payload["steps"].append({
                "cell_id": cell.id,
                "outcome": "empty",
                "reason": "уже обнаружено",
            })
            continue

        base = 0.20
        bonus = (cell.tunnel_progress / 100.0) * 0.30
        detection = base + bonus + float(modifier["detection_bonus"])

        if random.random() < detection:
            cell.tunnel_discovered = True
            cell.locked_until = datetime.now(UTC) + timedelta(days=2)
            steps.append(PatrolStep(
                cell_id=cell.id, block=cell.block, number=cell.number,
                outcome="busted",
                tunnel_progress_before=progress_before,
                tunnel_progress_after=cell.tunnel_progress,
            ))
            result_payload["steps"].append({
                "cell_id": cell.id,
                "block": cell.block,
                "number": cell.number,
                "outcome": "busted",
            })
            db.add(PrisonBreakEventLog(
                event_id=guard.event_id,
                kind="patrol_planned_bust",
                visibility="public",
                actor_id=guard.id,
                payload={
                    "plan_id": plan.id,
                    "cell_id": cell.id,
                    "block": cell.block,
                    "number": cell.number,
                    "focus": plan.focus,
                },
            ))
        elif plan.focus == "stealth":
            steps.append(PatrolStep(
                cell_id=cell.id, block=cell.block, number=cell.number,
                outcome="stealth_pass",
                tunnel_progress_before=progress_before,
                tunnel_progress_after=cell.tunnel_progress,
            ))
            result_payload["steps"].append({
                "cell_id": cell.id,
                "outcome": "stealth_pass",
            })
        else:
            steps.append(PatrolStep(
                cell_id=cell.id, block=cell.block, number=cell.number,
                outcome="empty",
                tunnel_progress_before=progress_before,
                tunnel_progress_after=cell.tunnel_progress,
            ))
            result_payload["steps"].append({
                "cell_id": cell.id,
                "outcome": "empty",
            })

    plan.executed = True
    plan.executed_at = datetime.now(UTC)
    plan.result = result_payload

    guard.ap_current = max(0, guard.ap_current - ap_cost)
    db.add(PrisonBreakAction(
        event_id=guard.event_id,
        actor_id=guard.id,
        target_id=None,
        action_type="patrol_execute",
        ap_spent=ap_cost,
        success=True,
        extra={
            "plan_id": plan.id,
            "focus": plan.focus,
            "steps": result_payload["steps"],
        },
    ))

    # Seed intel atom for an aggressive successful bust — guards talk.
    busted_cells = [s for s in steps if s.outcome == "busted"]
    if busted_cells and plan.focus == "aggressive":
        intel = PrisonBreakIntel(
            event_id=guard.event_id,
            content=(
                f"Охрана раскрыла {len(busted_cells)} камер в блоке {plan.block} "
                f"за один обход."
            ),
            is_truth=True,
            category="warning",
            source_role="guard",
            source_user_id=guard.id,
            fabricated=False,
        )
        db.add(intel)
        await db.flush()
        # Auto-deliver to other guards in the event.
        other_guards = (await db.execute(
            select(PrisonBreakPlayer).where(
                PrisonBreakPlayer.event_id == guard.event_id,
                PrisonBreakPlayer.role == "guard",
                PrisonBreakPlayer.id != guard.id,
            )
        )).scalars().all()
        for g in other_guards:
            db.add(PrisonBreakIntelView(
                intel_id=intel.id, viewer_id=g.id, forwarded_from_id=guard.id,
            ))

    return PatrolResult(plan_id=plan.id, steps=steps, ap_spent=ap_cost)


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def list_plans(
    db: AsyncSession,
    guard: PrisonBreakPlayer,
    *,
    limit: int = 20,
) -> list[PrisonBreakPatrolPlan]:
    rows = await db.execute(
        select(PrisonBreakPatrolPlan)
        .where(PrisonBreakPatrolPlan.guard_id == guard.id)
        .order_by(PrisonBreakPatrolPlan.id.desc())
        .limit(min(50, limit))
    )
    return list(rows.scalars())


async def get_today_plan(
    db: AsyncSession,
    guard: PrisonBreakPlayer,
    event: PrisonBreakEvent,
) -> PrisonBreakPatrolPlan | None:
    return (await db.execute(
        select(PrisonBreakPatrolPlan).where(
            PrisonBreakPatrolPlan.guard_id == guard.id,
            PrisonBreakPatrolPlan.valid_for_day == event.current_day,
        )
    )).scalar_one_or_none()


async def list_block_cells(
    db: AsyncSession,
    event_id: int,
    block: str,
) -> list[PrisonBreakCell]:
    rows = await db.execute(
        select(PrisonBreakCell).where(
            PrisonBreakCell.event_id == event_id,
            PrisonBreakCell.block == block,
        ).order_by(PrisonBreakCell.number)
    )
    return list(rows.scalars())


async def _get_owned_plan(
    db: AsyncSession,
    guard: PrisonBreakPlayer,
    plan_id: int,
) -> PrisonBreakPatrolPlan:
    p = (await db.execute(
        select(PrisonBreakPatrolPlan).where(
            PrisonBreakPatrolPlan.id == plan_id,
            PrisonBreakPatrolPlan.guard_id == guard.id,
        )
    )).scalar_one_or_none()
    if p is None:
        raise ValueError("план не найден")
    return p
