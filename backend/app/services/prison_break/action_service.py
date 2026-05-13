"""prison_break — central action dispatcher.

`run_action(db, actor, action_type, target_id, idempotency_key)` is the
single entry point through which every AP-spend flows. It:

  1. Validates the action exists + actor has enough AP.
  2. Checks idempotency_key (returns cached result on retry).
  3. Hands off to the appropriate handler (dig, visit, patrol, snitch).
  4. Atomically writes the audit row + applies side effects.
  5. Returns a `ActionResult` summarising what happened.

Side effects fan out via prison_break_event_log so the WS broadcaster can
relay to the right audience (cellmates, faction, everyone).
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakCell,
    PrisonBreakEvent,
    PrisonBreakInventory,
    PrisonBreakPlayer,
    PrisonBreakTrust,
)
from app.models.prison_break.extras import (
    PrisonBreakEventLog,
)


# ---------------------------------------------------------------------------
# Action catalog
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ActionSpec:
    slug: str
    label: str
    ap_cost: int
    requires_target: bool
    requires_role: tuple[str, ...] | None  # None = any role
    cooldown_seconds: int = 0


ACTIONS: dict[str, ActionSpec] = {
    "dig": ActionSpec(
        slug="dig",
        label="Копать тоннель",
        ap_cost=2,
        requires_target=False,
        requires_role=("prisoner", "authority", "spy", "boss"),
    ),
    "visit": ActionSpec(
        slug="visit",
        label="Визит",
        ap_cost=1,
        requires_target=True,
        requires_role=None,
        cooldown_seconds=3 * 3600,  # 3h per target
    ),
    "patrol": ActionSpec(
        slug="patrol",
        label="Патрулировать",
        ap_cost=1,
        requires_target=False,
        requires_role=("guard",),
    ),
    "snitch": ActionSpec(
        slug="snitch",
        label="Снитчить",
        ap_cost=2,
        requires_target=True,
        requires_role=("prisoner", "authority", "spy", "boss"),
    ),
    "rest": ActionSpec(
        slug="rest",
        label="Отдых",
        ap_cost=0,
        requires_target=False,
        requires_role=None,
    ),
}


@dataclass
class ActionResult:
    ok: bool
    action_type: str
    ap_spent: int
    ap_remaining: int
    message: str
    payload: dict[str, Any]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def run_action(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    action_type: str,
    target_id: int | None,
    idempotency_key: str | None,
) -> ActionResult:
    """Atomic-ish AP-spend pipeline. Caller must commit."""
    spec = ACTIONS.get(action_type)
    if spec is None:
        raise ValueError(f"unknown action_type: {action_type!r}")

    # Idempotency check — return cached result if we've already processed this.
    if idempotency_key:
        cached = (await db.execute(
            select(PrisonBreakAction).where(
                PrisonBreakAction.actor_id == actor.id,
                PrisonBreakAction.idempotency_key == idempotency_key,
            )
        )).scalar_one_or_none()
        if cached is not None:
            return ActionResult(
                ok=cached.success or False,
                action_type=cached.action_type,
                ap_spent=cached.ap_spent,
                ap_remaining=actor.ap_current,
                message=(cached.extra or {}).get("message", "(replay)"),
                payload=cached.extra or {},
            )

    # Role gate
    if spec.requires_role and actor.role not in spec.requires_role:
        raise PermissionError(
            f"role {actor.role!r} cannot perform {action_type!r}"
        )

    # Target requirement
    target: PrisonBreakPlayer | None = None
    if spec.requires_target:
        if target_id is None:
            raise ValueError(f"{action_type!r} requires a target")
        target = (await db.execute(
            select(PrisonBreakPlayer).where(
                PrisonBreakPlayer.id == target_id,
                PrisonBreakPlayer.event_id == actor.event_id,
            )
        )).scalar_one_or_none()
        if target is None:
            raise ValueError(f"target player not found in event")

    # AP gate
    if actor.ap_current < spec.ap_cost:
        raise ValueError(
            f"not enough AP: have {actor.ap_current}, need {spec.ap_cost}"
        )

    # Dispatch to handler
    handler = HANDLERS[action_type]
    result = await handler(db, actor, target)

    # Spend AP atomically (handler already updated state)
    actor.ap_current = max(0, actor.ap_current - spec.ap_cost)

    # Audit row
    action_row = PrisonBreakAction(
        event_id=actor.event_id,
        actor_id=actor.id,
        target_id=target.id if target else None,
        action_type=action_type,
        ap_spent=spec.ap_cost,
        success=result.ok,
        idempotency_key=idempotency_key,
        extra={
            "message": result.message,
            **result.payload,
        },
    )
    db.add(action_row)
    try:
        await db.flush()
    except IntegrityError:
        # Idempotency collision (another concurrent submit). Re-fetch cached.
        await db.rollback()
        return await run_action(db, actor, action_type, target_id, idempotency_key)

    result.ap_remaining = actor.ap_current
    return result


# ---------------------------------------------------------------------------
# Handlers (one per action_type)
# ---------------------------------------------------------------------------


async def _handle_dig(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    _: PrisonBreakPlayer | None,
) -> ActionResult:
    if actor.cell_id is None:
        raise ValueError("not in a cell")
    cell = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.id == actor.cell_id)
    )).scalar_one_or_none()
    if cell is None:
        raise ValueError("cell missing")

    # Carcer (cell locked) — dig forbidden
    now = datetime.now(UTC)
    if cell.locked_until and cell.locked_until > now:
        return ActionResult(
            ok=False,
            action_type="dig",
            ap_spent=2,
            ap_remaining=0,  # filled by caller
            message="Камера в карцере — копать нельзя",
            payload={"cell_id": cell.id, "blocked": True},
        )

    # Roll base progress
    base = random.randint(3, 7)
    bonus = 0
    # Crowbar consumption
    crowbar = (await db.execute(
        select(PrisonBreakInventory).where(
            PrisonBreakInventory.owner_id == actor.id,
            PrisonBreakInventory.item_type == "crowbar",
        ).limit(1)
    )).scalar_one_or_none()
    used_crowbar = False
    if crowbar is not None:
        bonus += 2
        await db.delete(crowbar)
        used_crowbar = True

    # Trust bonus: if actor has >75 trust with 2+ cellmates → +3
    cellmates = (await db.execute(
        select(PrisonBreakPlayer.id).where(
            PrisonBreakPlayer.cell_id == cell.id,
            PrisonBreakPlayer.id != actor.id,
        )
    )).scalars().all()
    if cellmates:
        # Trust pairs ordered (smaller id first).
        high_trust_count = 0
        for other in cellmates:
            a, b = sorted([actor.id, other])
            tr = (await db.execute(
                select(PrisonBreakTrust).where(
                    PrisonBreakTrust.event_id == actor.event_id,
                    PrisonBreakTrust.user_a == a,
                    PrisonBreakTrust.user_b == b,
                )
            )).scalar_one_or_none()
            score = tr.score if tr else 50
            if score > 75:
                high_trust_count += 1
        if high_trust_count >= 2:
            bonus += 3

    delta = min(100 - cell.tunnel_progress, base + bonus)
    cell.tunnel_progress = min(100, cell.tunnel_progress + delta)

    # Discovery roll. Simplified: 5% base, less with disabled camera.
    discovery_chance = 0.05
    if cell.camera_disabled_until and cell.camera_disabled_until > now:
        discovery_chance -= 0.03
    discovered = random.random() < max(0.005, discovery_chance)
    busted = False
    if discovered:
        cell.tunnel_discovered = True
        # Lock cell for 2 days — block further dig.
        from datetime import timedelta
        cell.locked_until = now + timedelta(days=2)
        busted = True

    # Broadcast event log
    db.add(PrisonBreakEventLog(
        event_id=actor.event_id,
        kind="tunnel_progress" if not busted else "tunnel_discovered",
        visibility="cell",
        actor_id=actor.id,
        payload={
            "cell_id": cell.id,
            "delta": delta,
            "progress": cell.tunnel_progress,
            "used_crowbar": used_crowbar,
            "busted": busted,
        },
    ))

    msg = f"+{delta}% к тоннелю"
    if used_crowbar:
        msg += " (лом сработал)"
    if busted:
        msg += " — НО ОХРАНА ЗАМЕТИЛА!"
    return ActionResult(
        ok=not busted,
        action_type="dig",
        ap_spent=2,
        ap_remaining=0,
        message=msg,
        payload={
            "cell_id": cell.id,
            "delta": delta,
            "progress": cell.tunnel_progress,
            "busted": busted,
        },
    )


async def _handle_visit(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    target: PrisonBreakPlayer | None,
) -> ActionResult:
    if target is None or target.id == actor.id:
        raise ValueError("visit needs a different player as target")

    # Trust +5 between actor and target.
    a, b = sorted([actor.id, target.id])
    tr = (await db.execute(
        select(PrisonBreakTrust).where(
            PrisonBreakTrust.event_id == actor.event_id,
            PrisonBreakTrust.user_a == a,
            PrisonBreakTrust.user_b == b,
        )
    )).scalar_one_or_none()
    if tr is None:
        tr = PrisonBreakTrust(
            event_id=actor.event_id, user_a=a, user_b=b, score=55,
        )
        db.add(tr)
    else:
        tr.score = min(100, tr.score + 5)
        tr.last_change_at = datetime.now(UTC)

    db.add(PrisonBreakEventLog(
        event_id=actor.event_id,
        kind="visit",
        visibility="private",
        actor_id=actor.id,
        target_id=target.id,
        payload={"trust_now": tr.score},
    ))

    return ActionResult(
        ok=True,
        action_type="visit",
        ap_spent=1,
        ap_remaining=0,
        message=f"Визит к {target.nickname} (+5 trust, теперь {tr.score})",
        payload={"target_id": target.id, "trust_now": tr.score},
    )


async def _handle_patrol(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    _: PrisonBreakPlayer | None,
) -> ActionResult:
    # Find a random cell in actor's block that has tunnel progress > 0
    if actor.block is None:
        raise ValueError("guard has no assigned block")
    cells = (await db.execute(
        select(PrisonBreakCell).where(
            PrisonBreakCell.event_id == actor.event_id,
            PrisonBreakCell.block == actor.block,
            PrisonBreakCell.tunnel_progress > 0,
            PrisonBreakCell.tunnel_discovered.is_(False),
        )
    )).scalars().all()
    if not cells:
        return ActionResult(
            ok=True,
            action_type="patrol",
            ap_spent=1,
            ap_remaining=0,
            message="Патруль завершён. В блоке всё спокойно.",
            payload={"found": False},
        )

    cell = random.choice(cells)
    detection = 0.20 + (cell.tunnel_progress / 100) * 0.30
    if random.random() < detection:
        # Bust the cell
        from datetime import timedelta
        cell.tunnel_discovered = True
        cell.locked_until = datetime.now(UTC) + timedelta(days=2)
        db.add(PrisonBreakEventLog(
            event_id=actor.event_id,
            kind="patrol_bust",
            visibility="public",
            actor_id=actor.id,
            payload={"cell_id": cell.id, "block": cell.block},
        ))
        return ActionResult(
            ok=True,
            action_type="patrol",
            ap_spent=1,
            ap_remaining=0,
            message=f"ЗАСТУКАЛ копателей в блоке {cell.block}, камера {cell.number}!",
            payload={"found": True, "cell_id": cell.id},
        )

    db.add(PrisonBreakEventLog(
        event_id=actor.event_id,
        kind="patrol_empty",
        visibility="faction",
        actor_id=actor.id,
        payload={"block": actor.block},
    ))
    return ActionResult(
        ok=True,
        action_type="patrol",
        ap_spent=1,
        ap_remaining=0,
        message=f"Прошёл по блоку {actor.block}. Шум есть, но не пойман.",
        payload={"found": False, "block": actor.block},
    )


async def _handle_snitch(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    target: PrisonBreakPlayer | None,
) -> ActionResult:
    if target is None:
        raise ValueError("snitch needs target")

    # Mass trust hit if cellmate
    if target.cell_id == actor.cell_id and actor.cell_id is not None:
        a, b = sorted([actor.id, target.id])
        tr = (await db.execute(
            select(PrisonBreakTrust).where(
                PrisonBreakTrust.event_id == actor.event_id,
                PrisonBreakTrust.user_a == a,
                PrisonBreakTrust.user_b == b,
            )
        )).scalar_one_or_none()
        if tr is None:
            tr = PrisonBreakTrust(
                event_id=actor.event_id, user_a=a, user_b=b, score=10,
            )
            db.add(tr)
        else:
            tr.score = max(0, tr.score - 50)

    # Pay-out
    actor.money += 50

    db.add(PrisonBreakEventLog(
        event_id=actor.event_id,
        kind="snitch",
        visibility="private",  # only guards see snitches
        actor_id=actor.id,
        target_id=target.id,
        payload={"snitch_payout": 50},
    ))

    return ActionResult(
        ok=True,
        action_type="snitch",
        ap_spent=2,
        ap_remaining=0,
        message=f"Сдал {target.nickname} охране. +50 🪙",
        payload={"target_id": target.id, "payout": 50},
    )


async def _handle_rest(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    _: PrisonBreakPlayer | None,
) -> ActionResult:
    # Rest — passive flavour, +1 trust with each cellmate.
    if actor.cell_id is None:
        return ActionResult(
            ok=True, action_type="rest", ap_spent=0, ap_remaining=0,
            message="Отдохнул на нарах.", payload={},
        )
    cellmates = (await db.execute(
        select(PrisonBreakPlayer.id).where(
            PrisonBreakPlayer.cell_id == actor.cell_id,
            PrisonBreakPlayer.id != actor.id,
        )
    )).scalars().all()
    for other in cellmates:
        a, b = sorted([actor.id, other])
        tr = (await db.execute(
            select(PrisonBreakTrust).where(
                PrisonBreakTrust.event_id == actor.event_id,
                PrisonBreakTrust.user_a == a,
                PrisonBreakTrust.user_b == b,
            )
        )).scalar_one_or_none()
        if tr is None:
            tr = PrisonBreakTrust(
                event_id=actor.event_id, user_a=a, user_b=b, score=51,
            )
            db.add(tr)
        else:
            tr.score = min(100, tr.score + 1)
    return ActionResult(
        ok=True, action_type="rest", ap_spent=0, ap_remaining=0,
        message="Отдохнул в камере, +1 trust сокамерникам", payload={},
    )


HANDLERS = {
    "dig": _handle_dig,
    "visit": _handle_visit,
    "patrol": _handle_patrol,
    "snitch": _handle_snitch,
    "rest": _handle_rest,
}


# ---------------------------------------------------------------------------
# Daily tick — refill AP, advance day, possibly advance phase
# ---------------------------------------------------------------------------


PHASE_BY_DAY = [
    (1, "setup"), (5, "plotting"), (13, "action"), (19, "endgame"),
]


async def daily_tick(db: AsyncSession, event: PrisonBreakEvent) -> int:
    """Advance the event one day. Returns count of players refilled."""
    if event.status != "active":
        return 0
    event.current_day += 1
    duration = (event.config or {}).get("duration_days", 21)
    if event.current_day > duration:
        event.status = "finished"
        event.ends_at = datetime.now(UTC)
        return 0
    # Phase advancement
    for start_day, phase in PHASE_BY_DAY:
        if event.current_day >= start_day:
            event.current_phase = phase
    # Refill AP — daily base from config
    base = (event.config or {}).get("ap_daily_base", 3)
    carry_max = (event.config or {}).get("ap_max_carry", 5)
    rows = await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.status == "active",
        )
    )
    n = 0
    for p in rows.scalars():
        p.ap_current = min(carry_max, p.ap_current + base)
        p.ap_max = max(p.ap_max, p.ap_current)
        n += 1
    return n
