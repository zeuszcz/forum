"""prison_break — pairwise trust service.

Trust is a 0-100 score between any two players, stored once per ordered pair
(user_a < user_b). The action_service mutates it as a side effect of `visit`,
`rest`, `snitch`, etc; this module provides the read API for the UI and a
handful of explicit adjusters (gift, vouch, slap) that the alliance and
intel-forward services call.

The score is a soft heuristic — the canonical model is the action history
log (`prison_break_action`). Trust just summarises "how warm are these two".
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakEvent,
    PrisonBreakPlayer,
    PrisonBreakTrust,
)


# ---------------------------------------------------------------------------
# Score adjustment primitives
# ---------------------------------------------------------------------------


async def adjust(
    db: AsyncSession,
    event_id: int,
    a_id: int,
    b_id: int,
    delta: int,
    *,
    create_baseline: int = 50,
) -> PrisonBreakTrust:
    """Increment/decrement a pair's trust score.

    `delta` is clamped so the new score stays in [0, 100]. The first call for
    a pair creates the row at `create_baseline` (default 50 = neutral) and
    then applies delta.
    """
    if a_id == b_id:
        raise ValueError("cannot adjust trust with self")
    user_a, user_b = sorted([a_id, b_id])
    tr = (await db.execute(
        select(PrisonBreakTrust).where(
            PrisonBreakTrust.event_id == event_id,
            PrisonBreakTrust.user_a == user_a,
            PrisonBreakTrust.user_b == user_b,
        )
    )).scalar_one_or_none()
    now = datetime.now(UTC)
    if tr is None:
        tr = PrisonBreakTrust(
            event_id=event_id,
            user_a=user_a,
            user_b=user_b,
            score=max(0, min(100, create_baseline + delta)),
            last_change_at=now,
        )
        db.add(tr)
    else:
        tr.score = max(0, min(100, tr.score + delta))
        tr.last_change_at = now
    return tr


@dataclass(frozen=True)
class TrustEdge:
    other_id: int
    other_nickname: str
    score: int
    last_change_at: datetime


async def list_for_player(
    db: AsyncSession,
    player: PrisonBreakPlayer,
) -> list[TrustEdge]:
    """All trust edges incident to `player`, with the other player's name."""
    rows = await db.execute(
        select(PrisonBreakTrust, PrisonBreakPlayer)
        .join(
            PrisonBreakPlayer,
            PrisonBreakPlayer.id == PrisonBreakTrust.user_b,
        )
        .where(
            PrisonBreakTrust.event_id == player.event_id,
            PrisonBreakTrust.user_a == player.id,
        )
    )
    edges: list[TrustEdge] = []
    for tr, other in rows.all():
        edges.append(TrustEdge(
            other_id=other.id,
            other_nickname=other.nickname,
            score=tr.score,
            last_change_at=tr.last_change_at,
        ))
    # Also pairs where viewer is user_b — join the other side.
    rows2 = await db.execute(
        select(PrisonBreakTrust, PrisonBreakPlayer)
        .join(
            PrisonBreakPlayer,
            PrisonBreakPlayer.id == PrisonBreakTrust.user_a,
        )
        .where(
            PrisonBreakTrust.event_id == player.event_id,
            PrisonBreakTrust.user_b == player.id,
        )
    )
    for tr, other in rows2.all():
        edges.append(TrustEdge(
            other_id=other.id,
            other_nickname=other.nickname,
            score=tr.score,
            last_change_at=tr.last_change_at,
        ))
    edges.sort(key=lambda e: (-e.score, e.other_nickname))
    return edges


# ---------------------------------------------------------------------------
# Explicit voluntary actions — gift / vouch / slap
# ---------------------------------------------------------------------------


VOLUNTARY_AP_COST: dict[str, int] = {
    "gift": 1,
    "vouch": 1,
    "slap": 1,
}

VOLUNTARY_DELTA: dict[str, int] = {
    "gift": 8,
    "vouch": 4,
    "slap": -10,
}


async def voluntary_trust_action(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    target_id: int,
    kind: str,
) -> tuple[PrisonBreakTrust, int]:
    """Apply a one-shot voluntary trust gesture. Spends 1 AP.

    Returns (trust_row, new_score). Raises ValueError on bad input,
    PermissionError if actor lacks AP.
    """
    if kind not in VOLUNTARY_DELTA:
        raise ValueError(f"unknown trust action {kind!r}")
    cost = VOLUNTARY_AP_COST[kind]
    if actor.ap_current < cost:
        raise PermissionError(
            f"not enough AP: have {actor.ap_current}, need {cost}"
        )
    target = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.id == target_id,
            PrisonBreakPlayer.event_id == actor.event_id,
            PrisonBreakPlayer.status == "active",
        )
    )).scalar_one_or_none()
    if target is None:
        raise ValueError("target not found")
    if target.id == actor.id:
        raise ValueError("cannot target self")

    delta = VOLUNTARY_DELTA[kind]
    tr = await adjust(db, actor.event_id, actor.id, target.id, delta)
    actor.ap_current = max(0, actor.ap_current - cost)

    # Audit log — leverage the same action table for replay/admin.
    db.add(PrisonBreakAction(
        event_id=actor.event_id,
        actor_id=actor.id,
        target_id=target.id,
        action_type=f"trust_{kind}",
        ap_spent=cost,
        success=True,
        extra={"delta": delta, "score_after": tr.score},
    ))
    return tr, tr.score


# ---------------------------------------------------------------------------
# Trust history — useful in the trust UI
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TrustEvent:
    at: datetime
    action_type: str
    actor_id: int
    actor_nickname: str
    target_id: int
    target_nickname: str
    delta: int | None
    score_after: int | None


async def list_history(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    *,
    limit: int = 50,
) -> list[TrustEvent]:
    """Return last `limit` trust-impacting actions for `player`.

    We surface anything where the player is actor or target with an action
    that mutates trust: visit, rest, snitch, trust_gift/vouch/slap, intel
    forward.
    """
    trust_actions = (
        "visit", "rest", "snitch",
        "trust_gift", "trust_vouch", "trust_slap",
        "intel_forward",
    )
    rows = await db.execute(
        select(PrisonBreakAction)
        .where(
            PrisonBreakAction.event_id == player.event_id,
            PrisonBreakAction.action_type.in_(trust_actions),
            or_(
                PrisonBreakAction.actor_id == player.id,
                PrisonBreakAction.target_id == player.id,
            ),
        )
        .order_by(PrisonBreakAction.created_at.desc())
        .limit(min(200, limit))
    )
    actions = list(rows.scalars())
    if not actions:
        return []
    player_ids: set[int] = set()
    for a in actions:
        player_ids.add(a.actor_id)
        if a.target_id is not None:
            player_ids.add(a.target_id)
    names_rows = await db.execute(
        select(PrisonBreakPlayer.id, PrisonBreakPlayer.nickname).where(
            PrisonBreakPlayer.id.in_(player_ids)
        )
    )
    names: dict[int, str] = {pid: nick for pid, nick in names_rows.all()}

    out: list[TrustEvent] = []
    for a in actions:
        meta = a.extra or {}
        out.append(TrustEvent(
            at=a.created_at,
            action_type=a.action_type,
            actor_id=a.actor_id,
            actor_nickname=names.get(a.actor_id, "?"),
            target_id=a.target_id or 0,
            target_nickname=names.get(a.target_id or 0, "?"),
            delta=meta.get("delta") or meta.get("trust_delta"),
            score_after=meta.get("score_after") or meta.get("trust_now"),
        ))
    return out
