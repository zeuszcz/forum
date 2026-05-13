"""prison_break — alliance / pact lifecycle.

A pact is a multi-party agreement signed during the event. Lifecycle:

    proposed --(all parties sign)--> active --(expires_at)--> expired
        |                              |
        +--(any party cancels)--> cancelled
                                       +--(any party breaks)--> broken

Pact types (informational, not enforced by the engine — the game master
or the cinematic decides):
    nonaggression   — "we won't snitch on each other"
    mutual_dig      — "we share scrap + crowbar bonuses"
    intel_share     — "we forward each other every intel atom"
    loan            — "A lends B 100 🪙, due day N"
    backup_arena    — "we forfeit arena duels with each other"

Signing rules:
    * The proposer is auto-signed on creation.
    * Every other party must sign explicitly before the pact activates.
    * `parties` is stored as a plain INTEGER[] of player IDs.
    * `terms` is a free-form JSON blob — UI shapes it.

Breaking rules:
    * Any party can break unilaterally. Doing so:
        - sets status='broken', broken_at, broken_by_id
        - applies trust penalty: -15 between the breaker and every other party
        - logs a `prison_break_action` of type "alliance_break"
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakAlliance,
    PrisonBreakPlayer,
    PrisonBreakTrust,
)
from app.services.prison_break.trust_service import adjust as adjust_trust


VALID_PACT_TYPES: set[str] = {
    "nonaggression",
    "mutual_dig",
    "intel_share",
    "loan",
    "backup_arena",
}


# ---------------------------------------------------------------------------
# Creation + signing
# ---------------------------------------------------------------------------


async def propose(
    db: AsyncSession,
    proposer: PrisonBreakPlayer,
    parties: list[int],
    pact_type: str,
    terms: dict[str, Any],
    duration_days: int = 5,
) -> PrisonBreakAlliance:
    """Create a new pact in `proposed` status. Proposer is auto-signed.

    `parties` must include the proposer's id. Players are deduplicated; min
    size is 2.
    """
    if pact_type not in VALID_PACT_TYPES:
        raise ValueError(f"unknown pact_type {pact_type!r}")
    party_set = {int(pid) for pid in parties} | {proposer.id}
    if len(party_set) < 2:
        raise ValueError("pact needs at least 2 parties")
    if len(party_set) > 6:
        raise ValueError("pact cannot have more than 6 parties")

    # Validate every party is alive in this event.
    rows = await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.id.in_(party_set),
            PrisonBreakPlayer.event_id == proposer.event_id,
            PrisonBreakPlayer.status == "active",
        )
    )
    found = {p.id for p in rows.scalars()}
    missing = party_set - found
    if missing:
        raise ValueError(f"parties not in event or eliminated: {sorted(missing)}")

    if duration_days < 1 or duration_days > 21:
        raise ValueError("duration_days must be 1..21")

    expires = datetime.now(UTC) + timedelta(days=duration_days)

    # Store signatures + proposer in `terms` so we can iterate signing.
    extended_terms = {
        **(terms or {}),
        "proposer_id": proposer.id,
        "signatures": [proposer.id],
        "required_signers": sorted(party_set),
    }
    alliance = PrisonBreakAlliance(
        event_id=proposer.event_id,
        parties=sorted(party_set),
        pact_type=pact_type,
        terms=extended_terms,
        status="proposed",
        expires_at=expires,
    )
    db.add(alliance)
    await db.flush()

    db.add(PrisonBreakAction(
        event_id=proposer.event_id,
        actor_id=proposer.id,
        target_id=None,
        action_type="alliance_propose",
        ap_spent=0,
        success=True,
        extra={
            "alliance_id": alliance.id,
            "pact_type": pact_type,
            "parties": sorted(party_set),
        },
    ))

    # If pact already only has proposer + one party AND that party = proposer
    # (sanity guard) — skip. Otherwise leave in proposed.
    return alliance


async def sign(
    db: AsyncSession,
    signer: PrisonBreakPlayer,
    alliance_id: int,
) -> PrisonBreakAlliance:
    """A party signs the pact. Activates once all required signers have signed."""
    alliance = (await db.execute(
        select(PrisonBreakAlliance).where(
            PrisonBreakAlliance.id == alliance_id,
            PrisonBreakAlliance.event_id == signer.event_id,
        )
    )).scalar_one_or_none()
    if alliance is None:
        raise ValueError("alliance not found")
    if alliance.status != "proposed":
        raise ValueError(f"alliance status is {alliance.status!r}, not proposed")
    if signer.id not in (alliance.parties or []):
        raise PermissionError("you are not a party to this pact")

    terms = dict(alliance.terms or {})
    sigs: list[int] = list(terms.get("signatures") or [])
    if signer.id in sigs:
        return alliance
    sigs.append(signer.id)
    terms["signatures"] = sigs
    alliance.terms = terms

    required = set(terms.get("required_signers") or alliance.parties or [])
    if required.issubset(set(sigs)):
        alliance.status = "active"
        alliance.signed_at = datetime.now(UTC)

    db.add(PrisonBreakAction(
        event_id=signer.event_id,
        actor_id=signer.id,
        target_id=None,
        action_type="alliance_sign",
        ap_spent=0,
        success=True,
        extra={
            "alliance_id": alliance.id,
            "activated": alliance.status == "active",
        },
    ))
    return alliance


# ---------------------------------------------------------------------------
# Cancellation and breaking
# ---------------------------------------------------------------------------


async def cancel(
    db: AsyncSession,
    actor: PrisonBreakPlayer,
    alliance_id: int,
) -> PrisonBreakAlliance:
    """Cancel a `proposed` alliance (no penalty)."""
    alliance = (await db.execute(
        select(PrisonBreakAlliance).where(
            PrisonBreakAlliance.id == alliance_id,
            PrisonBreakAlliance.event_id == actor.event_id,
        )
    )).scalar_one_or_none()
    if alliance is None:
        raise ValueError("alliance not found")
    if alliance.status != "proposed":
        raise ValueError(f"cannot cancel — status is {alliance.status!r}")
    if actor.id not in (alliance.parties or []):
        raise PermissionError("not a party")
    alliance.status = "cancelled"
    alliance.broken_at = datetime.now(UTC)
    alliance.broken_by_id = actor.id

    db.add(PrisonBreakAction(
        event_id=actor.event_id,
        actor_id=actor.id,
        target_id=None,
        action_type="alliance_cancel",
        ap_spent=0,
        success=True,
        extra={"alliance_id": alliance.id},
    ))
    return alliance


async def break_pact(
    db: AsyncSession,
    breaker: PrisonBreakPlayer,
    alliance_id: int,
) -> tuple[PrisonBreakAlliance, list[int]]:
    """Break an active pact. Applies -15 trust to every other party.

    Returns (alliance, affected_party_ids).
    """
    alliance = (await db.execute(
        select(PrisonBreakAlliance).where(
            PrisonBreakAlliance.id == alliance_id,
            PrisonBreakAlliance.event_id == breaker.event_id,
        )
    )).scalar_one_or_none()
    if alliance is None:
        raise ValueError("alliance not found")
    if alliance.status != "active":
        raise ValueError(f"cannot break — status is {alliance.status!r}")
    if breaker.id not in (alliance.parties or []):
        raise PermissionError("not a party")

    alliance.status = "broken"
    alliance.broken_at = datetime.now(UTC)
    alliance.broken_by_id = breaker.id

    others = [pid for pid in (alliance.parties or []) if pid != breaker.id]
    for other in others:
        await adjust_trust(
            db, breaker.event_id, breaker.id, other, delta=-15,
        )

    db.add(PrisonBreakAction(
        event_id=breaker.event_id,
        actor_id=breaker.id,
        target_id=None,
        action_type="alliance_break",
        ap_spent=0,
        success=True,
        extra={
            "alliance_id": alliance.id,
            "trust_delta": -15,
            "affected": others,
        },
    ))
    return alliance, others


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


async def list_visible_to(
    db: AsyncSession,
    player: PrisonBreakPlayer,
) -> list[PrisonBreakAlliance]:
    """Pacts where `player` is a party. Newest first."""
    rows = await db.execute(
        select(PrisonBreakAlliance)
        .where(
            PrisonBreakAlliance.event_id == player.event_id,
            PrisonBreakAlliance.parties.any(player.id),
        )
        .order_by(PrisonBreakAlliance.id.desc())
    )
    return list(rows.scalars())


async def get_for_player(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    alliance_id: int,
) -> PrisonBreakAlliance | None:
    """Fetch a single alliance if `player` is a party."""
    alliance = (await db.execute(
        select(PrisonBreakAlliance).where(
            PrisonBreakAlliance.id == alliance_id,
            PrisonBreakAlliance.event_id == player.event_id,
        )
    )).scalar_one_or_none()
    if alliance is None:
        return None
    if player.id not in (alliance.parties or []):
        return None
    return alliance


async def expire_due(
    db: AsyncSession,
    event_id: int,
) -> int:
    """Mark `active` pacts past expires_at as expired. Returns count."""
    now = datetime.now(UTC)
    rows = await db.execute(
        select(PrisonBreakAlliance).where(
            PrisonBreakAlliance.event_id == event_id,
            PrisonBreakAlliance.status == "active",
            PrisonBreakAlliance.expires_at.is_not(None),
            PrisonBreakAlliance.expires_at <= now,
        )
    )
    n = 0
    for a in rows.scalars():
        a.status = "expired"
        n += 1
    return n
