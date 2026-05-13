"""prison_break — reveal cinematics.

The Reveal layer is the public information shock-cycle of the event.
Throughout the 21-day run a handful of scheduled reveals fire at
specific days, exposing slices of the hidden state to every player:

  • role_reveal      one random non-prisoner role is exposed
  • alliance_dump    every active alliance becomes public knowledge
  • tunnel_status    tunnel progress for every cell is broadcast
  • intel_truth      every existing intel atom's truth/fabrication flag
                     is exposed to every player (Day 19+)
  • faction_count    number of living players per faction
  • boss_reveal      the boss's identity is exposed
  • final_curtain    full reveal — every role + the winning side

Each reveal lives as a row in `prison_break_reveal` with a JSON payload.
The default schedule is created when the event flips to `active`. Admin
can fire any reveal early (`trigger_reveal_now`).

Side effects:
  * role_reveal sets `prison_break_player.revealed_role` on the targeted
    player. From that moment the public `/players` endpoint surfaces
    that role.
  * boss_reveal triggers a role_reveal for the boss.
  * alliance_dump / tunnel_status / faction_count / intel_truth all
    write their payload into the reveal row; the frontend formats them
    into a cinematic.

The router exposes `GET /reveals` returning already-fired reveals for
the current event, newest first. Scheduled-but-not-yet-fired reveals are
hidden from non-staff.
"""
from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakAlliance,
    PrisonBreakCell,
    PrisonBreakEvent,
    PrisonBreakIntel,
    PrisonBreakIntelView,
    PrisonBreakPlayer,
    PrisonBreakReveal,
)
from app.models.prison_break.extras import PrisonBreakEventLog


VALID_REVEAL_TYPES: set[str] = {
    "role_reveal",
    "alliance_dump",
    "tunnel_status",
    "intel_truth",
    "faction_count",
    "boss_reveal",
    "final_curtain",
}


# Days at which the default schedule places each reveal. Tunable in event
# config under `reveal_schedule`.
DEFAULT_SCHEDULE: list[tuple[int, str]] = [
    (5,  "tunnel_status"),
    (9,  "alliance_dump"),
    (11, "faction_count"),
    (13, "role_reveal"),
    (17, "role_reveal"),
    (19, "intel_truth"),
    (20, "boss_reveal"),
    (21, "final_curtain"),
]


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------


async def ensure_default_schedule(
    db: AsyncSession,
    event: PrisonBreakEvent,
) -> int:
    """Idempotent: write the default reveal rows if they aren't there yet.

    Returns count of new rows created.
    """
    existing = (await db.execute(
        select(func.count()).select_from(PrisonBreakReveal)
        .where(PrisonBreakReveal.event_id == event.id)
    )).scalar() or 0
    if existing > 0:
        return 0

    if event.starts_at is None:
        return 0

    n = 0
    for day, kind in DEFAULT_SCHEDULE:
        scheduled = event.starts_at + timedelta(days=day - 1)
        db.add(PrisonBreakReveal(
            event_id=event.id,
            day=day,
            reveal_type=kind,
            payload={},
            scheduled_for=scheduled,
        ))
        n += 1
    return n


async def list_visible(
    db: AsyncSession,
    event_id: int,
    *,
    limit: int = 30,
    include_pending: bool = False,
) -> list[PrisonBreakReveal]:
    """Return reveals already fired (revealed_at is not null) for the event."""
    stmt = select(PrisonBreakReveal).where(
        PrisonBreakReveal.event_id == event_id,
    )
    if not include_pending:
        stmt = stmt.where(PrisonBreakReveal.revealed_at.is_not(None))
    rows = await db.execute(
        stmt.order_by(PrisonBreakReveal.id.desc()).limit(min(60, limit))
    )
    return list(rows.scalars())


async def list_due(
    db: AsyncSession,
    event_id: int,
) -> list[PrisonBreakReveal]:
    """Return reveals whose scheduled_for is past but not yet revealed."""
    now = datetime.now(UTC)
    rows = await db.execute(
        select(PrisonBreakReveal).where(
            PrisonBreakReveal.event_id == event_id,
            PrisonBreakReveal.revealed_at.is_(None),
            PrisonBreakReveal.scheduled_for <= now,
        ).order_by(PrisonBreakReveal.scheduled_for.asc())
    )
    return list(rows.scalars())


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------


async def trigger_reveal(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal: PrisonBreakReveal,
) -> PrisonBreakReveal:
    """Run the side-effects for a single reveal + mark revealed_at."""
    if reveal.revealed_at is not None:
        return reveal
    rng = random.Random(reveal.id * 53 + event.id)

    handler = _HANDLERS.get(reveal.reveal_type)
    if handler is None:
        raise ValueError(f"unknown reveal_type {reveal.reveal_type!r}")
    payload = await handler(db, event, reveal, rng)

    reveal.payload = payload
    reveal.revealed_at = datetime.now(UTC)

    db.add(PrisonBreakEventLog(
        event_id=event.id,
        kind=f"reveal_{reveal.reveal_type}",
        visibility="public",
        actor_id=None,
        payload={"reveal_id": reveal.id, "day": reveal.day, **payload},
    ))
    db.add(PrisonBreakAction(
        event_id=event.id,
        actor_id=0,  # system actor sentinel — admins know to ignore zero
        target_id=None,
        action_type=f"reveal_{reveal.reveal_type}",
        ap_spent=0,
        success=True,
        extra={"reveal_id": reveal.id, **payload},
    )) if False else None  # action audit too noisy for reveals; skip
    return reveal


async def trigger_reveal_now(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal_type: str,
    *,
    day: int | None = None,
) -> PrisonBreakReveal:
    """Admin-style helper: create a fresh row and fire it immediately."""
    if reveal_type not in VALID_REVEAL_TYPES:
        raise ValueError(f"unknown reveal_type {reveal_type!r}")
    now = datetime.now(UTC)
    reveal = PrisonBreakReveal(
        event_id=event.id,
        day=day if day is not None else event.current_day,
        reveal_type=reveal_type,
        payload={},
        scheduled_for=now,
    )
    db.add(reveal)
    await db.flush()
    return await trigger_reveal(db, event, reveal)


async def auto_fire_due(
    db: AsyncSession,
    event: PrisonBreakEvent,
) -> int:
    """Fire every reveal whose scheduled_for is past. Returns count."""
    due = await list_due(db, event.id)
    n = 0
    for r in due:
        try:
            await trigger_reveal(db, event, r)
            n += 1
        except Exception:
            # Don't let one bad reveal stop the others.
            pass
    return n


# ---------------------------------------------------------------------------
# Per-type handlers
# ---------------------------------------------------------------------------


async def _h_role_reveal(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal: PrisonBreakReveal,
    rng: random.Random,
) -> dict[str, Any]:
    """Pick one un-revealed non-prisoner role-holder and expose them."""
    candidates = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.role.in_(["guard", "authority", "spy", "boss"]),
            PrisonBreakPlayer.revealed_role.is_(None),
            PrisonBreakPlayer.status == "active",
        )
    )).scalars().all()
    if not candidates:
        return {"empty": True, "reason": "no un-revealed roles left"}
    pick = rng.choice(list(candidates))
    pick.revealed_role = pick.role
    return {
        "target_player_id": pick.id,
        "target_nickname": pick.nickname,
        "target_tattoo": pick.tattoo,
        "role": pick.role,
    }


async def _h_alliance_dump(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal: PrisonBreakReveal,
    rng: random.Random,
) -> dict[str, Any]:
    """Surface every active alliance to everyone."""
    rows = (await db.execute(
        select(PrisonBreakAlliance).where(
            PrisonBreakAlliance.event_id == event.id,
            PrisonBreakAlliance.status == "active",
        )
    )).scalars().all()
    return {
        "alliances": [
            {
                "id": a.id,
                "pact_type": a.pact_type,
                "parties": list(a.parties or []),
                "expires_at": a.expires_at.isoformat() if a.expires_at else None,
            }
            for a in rows
        ],
        "count": len(rows),
    }


async def _h_tunnel_status(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal: PrisonBreakReveal,
    rng: random.Random,
) -> dict[str, Any]:
    """Public dump of every cell's tunnel progress."""
    cells = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.event_id == event.id)
    )).scalars().all()
    return {
        "cells": [
            {
                "id": c.id,
                "block": c.block,
                "number": c.number,
                "tunnel_progress": c.tunnel_progress,
                "tunnel_discovered": c.tunnel_discovered,
            }
            for c in cells
        ],
    }


async def _h_intel_truth(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal: PrisonBreakReveal,
    rng: random.Random,
) -> dict[str, Any]:
    """Reveal the truth/fabrication flag for every intel atom seen so far."""
    rows = (await db.execute(
        select(PrisonBreakIntel).where(PrisonBreakIntel.event_id == event.id)
    )).scalars().all()
    return {
        "total": len(rows),
        "true_count": sum(1 for x in rows if x.is_truth),
        "fabricated_count": sum(1 for x in rows if x.fabricated),
        "atoms": [
            {
                "id": x.id,
                "category": x.category,
                "is_truth": x.is_truth,
                "fabricated": x.fabricated,
                "source_role": x.source_role,
            }
            for x in rows[-40:]  # cap payload size
        ],
    }


async def _h_faction_count(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal: PrisonBreakReveal,
    rng: random.Random,
) -> dict[str, Any]:
    rows = await db.execute(
        select(
            PrisonBreakPlayer.faction,
            func.count(PrisonBreakPlayer.id),
        )
        .where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.status == "active",
        )
        .group_by(PrisonBreakPlayer.faction)
    )
    by_faction: dict[str, int] = {fac or "unknown": int(n) for fac, n in rows.all()}
    return {"by_faction": by_faction}


async def _h_boss_reveal(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal: PrisonBreakReveal,
    rng: random.Random,
) -> dict[str, Any]:
    boss = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.role == "boss",
        )
    )).scalar_one_or_none()
    if boss is None:
        return {"empty": True}
    boss.revealed_role = boss.role
    return {
        "target_player_id": boss.id,
        "target_nickname": boss.nickname,
        "target_tattoo": boss.tattoo,
        "role": "boss",
    }


async def _h_final_curtain(
    db: AsyncSession,
    event: PrisonBreakEvent,
    reveal: PrisonBreakReveal,
    rng: random.Random,
) -> dict[str, Any]:
    """End-state of the event — every role revealed, summary stats."""
    players = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.event_id == event.id)
    )).scalars().all()
    rows: list[dict[str, Any]] = []
    for p in players:
        p.revealed_role = p.role
        rows.append({
            "id": p.id,
            "nickname": p.nickname,
            "tattoo": p.tattoo,
            "role": p.role,
            "faction": p.faction,
            "status": p.status,
            "block": p.block,
            "cell_id": p.cell_id,
        })

    cells = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.event_id == event.id)
    )).scalars().all()
    return {
        "players": rows,
        "cells": [
            {
                "id": c.id,
                "block": c.block,
                "number": c.number,
                "tunnel_progress": c.tunnel_progress,
                "tunnel_discovered": c.tunnel_discovered,
            }
            for c in cells
        ],
    }


_HANDLERS = {
    "role_reveal": _h_role_reveal,
    "alliance_dump": _h_alliance_dump,
    "tunnel_status": _h_tunnel_status,
    "intel_truth": _h_intel_truth,
    "faction_count": _h_faction_count,
    "boss_reveal": _h_boss_reveal,
    "final_curtain": _h_final_curtain,
}
