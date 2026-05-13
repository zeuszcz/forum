"""Pydantic schemas for prison_break event endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# --- 12 valid tattoo glyphs the player can pick from --------------------------
ALLOWED_TATTOOS = (
    "💀", "⚡", "🌹", "🔥", "🐺", "🗡",
    "⚓", "☠", "🦂", "🐍", "🃏", "👁",
)


class EventPublic(BaseModel):
    """Public event info — shown to anyone (signed-up or not)."""

    id: int
    season: str
    title: str
    description: str
    status: str  # draft|signup|active|finished|cancelled
    current_phase: str
    current_day: int
    signup_opens_at: datetime | None
    starts_at: datetime | None
    ends_at: datetime | None
    config: dict[str, Any]
    registered_count: int = 0
    is_signed_up: bool = False
    can_signup: bool = False


class EventStatus(BaseModel):
    """Aggregate status returned to the dashboard."""

    event: EventPublic | None = None
    player: PlayerMe | None = None


class SignupRequest(BaseModel):
    """Player joins an event in `signup` status."""

    nickname: str = Field(min_length=2, max_length=32)
    tattoo: str = Field(min_length=1, max_length=8)
    article: str = Field(default="", max_length=80)

    @field_validator("tattoo")
    @classmethod
    def tattoo_must_be_allowed(cls, v: str) -> str:
        if v not in ALLOWED_TATTOOS:
            raise ValueError(
                f"tattoo must be one of {ALLOWED_TATTOOS!r}"
            )
        return v

    @field_validator("nickname")
    @classmethod
    def nickname_sanity(cls, v: str) -> str:
        # No |/control chars — they collide with our log-parsing infra.
        bad = set("|\n\r\t\0")
        if any(c in bad for c in v):
            raise ValueError("nickname contains forbidden characters")
        return v.strip()


class PlayerMe(BaseModel):
    """Own player view — full state of registered player for the dashboard."""

    id: int
    event_id: int
    nickname: str
    tattoo: str
    article: str
    role: str | None
    faction: str | None
    block: str | None
    cell_id: int | None
    ap_current: int
    ap_max: int
    money: int
    resource_scrap: int
    resource_paper: int
    status: str
    welcome_seen_at: datetime | None
    joined_at: datetime


class PlayerPublic(BaseModel):
    """Public player card — shown to others. Role hidden unless revealed."""

    id: int
    nickname: str
    tattoo: str
    block: str | None
    cell_id: int | None
    status: str
    # role hidden — players see only faction once roles are assigned and revealed
    revealed_role: str | None = None


# --- Admin endpoints ----------------------------------------------------------


class AdminCreateEvent(BaseModel):
    """Create a new draft event."""

    season: str = Field(min_length=3, max_length=20, examples=["2026.Q4"])
    title: str = Field(default="Тюремный Бунт", max_length=120)
    description: str = Field(default="", max_length=4000)
    signup_opens_at: datetime | None = None
    starts_at: datetime | None = None
    duration_days: int = Field(default=21, ge=7, le=42)


class AdminEventAction(BaseModel):
    """Admin transitions: open_signup | start | finish | cancel."""

    action: str = Field(
        description="open_signup | start | finish | cancel",
        pattern=r"^(open_signup|start|finish|cancel)$",
    )


class AdminEventResult(BaseModel):
    ok: bool
    event_id: int | None = None
    new_status: str | None = None
    message: str | None = None


class WelcomeAck(BaseModel):
    """Player acks the welcome cinematic so it doesn't replay."""

    ok: bool


# --- EPIC 4: Intel ------------------------------------------------------------


class IntelItem(BaseModel):
    """One intel atom in the player's feed."""

    intel_id: int
    content: str
    category: str  # rumor|warning|secret|leak|tip
    received_at: datetime
    forwarded_from_id: int | None = None
    # Truth fields only appear when reveal_truth=True (admin or post-finale)
    is_truth: bool | None = None
    fabricated: bool | None = None
    source_role: str | None = None


class IntelForwardRequest(BaseModel):
    intel_id: int = Field(ge=1)
    target_player_id: int = Field(ge=1)


class IntelForwardResult(BaseModel):
    ok: bool
    delivered_to: int
    trust_now: int | None = None
    ap_spent: int = 1
    ap_remaining: int


class AdminIntelDistributeResult(BaseModel):
    ok: bool
    generated: int
    delivered: int


# --- EPIC 4: Trust ------------------------------------------------------------


class TrustEdgeOut(BaseModel):
    other_id: int
    other_nickname: str
    score: int
    last_change_at: datetime


class TrustHistoryEntry(BaseModel):
    at: datetime
    action_type: str
    actor_id: int
    actor_nickname: str
    target_id: int
    target_nickname: str
    delta: int | None = None
    score_after: int | None = None


class TrustActionRequest(BaseModel):
    kind: str = Field(pattern=r"^(gift|vouch|slap)$")
    target_player_id: int = Field(ge=1)


class TrustActionResult(BaseModel):
    ok: bool
    kind: str
    target_id: int
    score: int
    ap_spent: int
    ap_remaining: int


# --- EPIC 4: Alliance ---------------------------------------------------------


class AllianceProposeRequest(BaseModel):
    parties: list[int] = Field(min_length=1, max_length=6)
    pact_type: str = Field(
        pattern=r"^(nonaggression|mutual_dig|intel_share|loan|backup_arena)$",
    )
    terms: dict[str, Any] = Field(default_factory=dict)
    duration_days: int = Field(default=5, ge=1, le=21)


class AllianceOut(BaseModel):
    id: int
    parties: list[int]
    pact_type: str
    terms: dict[str, Any]
    status: str  # proposed|active|expired|broken|cancelled
    proposed_at: datetime
    signed_at: datetime | None = None
    expires_at: datetime | None = None
    broken_at: datetime | None = None
    broken_by_id: int | None = None
    signatures: list[int] = Field(default_factory=list)
    required_signers: list[int] = Field(default_factory=list)
    is_signed_by_me: bool = False


class AllianceActionResult(BaseModel):
    ok: bool
    alliance_id: int
    new_status: str
    message: str | None = None


# Resolve forward ref so EventStatus can reference PlayerMe.
EventStatus.model_rebuild()
