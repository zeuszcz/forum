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


# --- EPIC 5: Lock-pick --------------------------------------------------------


class LockpickStartRequest(BaseModel):
    target_cell_id: int = Field(ge=1)


class LockpickTapRequest(BaseModel):
    pin_pick: int = Field(ge=0, le=6)


class LockpickStatus(BaseModel):
    id: int
    target_cell_id: int
    difficulty: int
    current_pin: int
    misses: int
    forgive_misses: int
    key_quality: str
    status: str
    started_at: datetime
    ended_at: datetime | None = None
    outcome: dict[str, Any] = Field(default_factory=dict)


class LockpickTapResult(BaseModel):
    correct: bool
    current_pin: int
    misses: int
    forgive_misses: int
    status: str  # active|won|lost|abandoned
    outcome: dict[str, Any] = Field(default_factory=dict)


# --- EPIC 5: Patrol planner ---------------------------------------------------


class PatrolCellInfo(BaseModel):
    cell_id: int
    block: str
    number: int
    tunnel_progress: int
    tunnel_discovered: bool


class PatrolPlanRequest(BaseModel):
    route: list[int] = Field(min_length=1, max_length=6)
    focus: str = Field(pattern=r"^(balanced|aggressive|stealth)$")


class PatrolPlanOut(BaseModel):
    id: int
    block: str
    route: list[int]
    focus: str
    valid_for_day: int
    executed: bool
    executed_at: datetime | None = None
    result: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class PatrolStepOut(BaseModel):
    cell_id: int
    block: str
    number: int
    outcome: str  # busted|empty|stealth_pass
    tunnel_progress_before: int
    tunnel_progress_after: int


class PatrolExecuteResult(BaseModel):
    ok: bool
    plan_id: int
    ap_spent: int
    ap_remaining: int
    steps: list[PatrolStepOut]


# --- EPIC 5: Interrogation ----------------------------------------------------


class InterrogationStartRequest(BaseModel):
    suspect_player_id: int = Field(ge=1)
    topic: str = Field(pattern=r"^(general|tunnel|alliance|intel_leak|role)$")


class InterrogationQuestion(BaseModel):
    tactic: str = Field(pattern=r"^(ask|bluff|threat|offer)$")
    body: str = Field(default="", max_length=500)


class InterrogationAnswer(BaseModel):
    tactic: str = Field(pattern=r"^(truth|lie|silence)$")
    body: str = Field(default="", max_length=500)


class InterrogationTurnOut(BaseModel):
    id: int
    role: str  # question|answer|system
    speaker_id: int
    tactic: str
    body: str
    delta_pressure: int
    created_at: datetime


class InterrogationOut(BaseModel):
    id: int
    interrogator_id: int
    suspect_id: int
    topic: str
    status: str
    rounds_remaining: int
    pressure: int
    trust_loss: int
    started_at: datetime
    ended_at: datetime | None = None
    outcome: dict[str, Any] = Field(default_factory=dict)
    turns: list[InterrogationTurnOut] = Field(default_factory=list)
    is_interrogator: bool = False
    is_suspect: bool = False


class InterrogationTurnResult(BaseModel):
    ok: bool
    pressure: int
    rounds_remaining: int
    status: str
    outcome: dict[str, Any] = Field(default_factory=dict)
    ap_remaining: int


# --- EPIC 6: Arena ------------------------------------------------------------


class ArenaSpecial(BaseModel):
    slug: str
    name: str
    emoji: str
    description: str
    stamina_cost: int
    damage: int
    range: int
    height: str
    startup_ticks: int
    active_ticks: int
    recovery_ticks: int
    cooldown_ticks: int
    knockback_x: float
    parry: bool = False
    dash: bool = False


class ArenaLoadoutRequest(BaseModel):
    specials: list[str] = Field(min_length=3, max_length=3)


class ArenaLoadoutOut(BaseModel):
    specials: list[str] = Field(default_factory=list)
    wins: int = 0
    losses: int = 0
    updated_at: str | None = None


class ArenaChallengeRequest(BaseModel):
    opponent_player_id: int = Field(ge=1)


class ArenaMatchOut(BaseModel):
    id: int
    event_id: int
    player_a_id: int
    player_b_id: int
    status: str
    winner_id: int | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime
    loadout_a: list[str] = Field(default_factory=list)
    loadout_b: list[str] = Field(default_factory=list)
    is_a: bool = False
    is_b: bool = False
    is_participant: bool = False


class ArenaBetRequest(BaseModel):
    on_player_id: int = Field(ge=1)
    amount: int = Field(ge=1, le=10000)


class ArenaBetOut(BaseModel):
    id: int
    match_id: int
    bettor_id: int
    on_player_id: int
    amount: int
    odds: float
    placed_at: datetime
    settled_at: datetime | None = None
    payout: int | None = None


class ArenaInputRequest(BaseModel):
    type: str = Field(pattern=r"^(move|block|special)$")
    dx: int | None = Field(default=None, ge=-1, le=1)
    height: str | None = Field(default=None, pattern=r"^(low|mid|high)$")
    slug: str | None = Field(default=None, max_length=40)


class ArenaInputResult(BaseModel):
    ok: bool


class ArenaStateOut(BaseModel):
    kind: str
    match_id: int
    tick: int
    max_ticks: int
    stage: dict[str, int]
    fighters: dict[str, dict[str, Any]]
    finished: bool
    winner_side: str | None = None
    winner_id: int | None = None
    recent_events: list[dict[str, Any]] = Field(default_factory=list)


# --- EPIC 7: Reveals + Finale -------------------------------------------------


class RevealOut(BaseModel):
    id: int
    day: int
    reveal_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    scheduled_for: datetime
    revealed_at: datetime | None = None


class AdminRevealTrigger(BaseModel):
    reveal_type: str = Field(
        pattern=r"^(role_reveal|alliance_dump|tunnel_status|intel_truth|faction_count|boss_reveal|final_curtain)$",
    )
    day: int | None = Field(default=None, ge=0, le=42)


class FinalVoteRequest(BaseModel):
    target_player_id: int = Field(ge=1)
    kind: str = Field(pattern=r"^(boss|snitch|hero)$")


class FinalVoteOut(BaseModel):
    id: int
    voter_id: int
    target_id: int
    kind: str
    created_at: datetime


class FinalVoteTallyEntry(BaseModel):
    target_id: int
    target_nickname: str
    count: int


class FinalVoteTally(BaseModel):
    boss: list[FinalVoteTallyEntry] = Field(default_factory=list)
    snitch: list[FinalVoteTallyEntry] = Field(default_factory=list)
    hero: list[FinalVoteTallyEntry] = Field(default_factory=list)


class FinalOutcomeOut(BaseModel):
    escaped_player_ids: list[int] = Field(default_factory=list)
    escape_count: int
    escape_rate: float
    boss_correct_votes: int
    boss_voter_count: int
    boss_correctly_identified: bool
    winning_side: str
    most_voted: dict[str, int] = Field(default_factory=dict)
    payouts: dict[str, int] = Field(default_factory=dict)


class IsometricCell(BaseModel):
    id: int
    block: str
    number: int
    tunnel_progress: int
    tunnel_discovered: bool
    locked_until: str | None = None
    members: list[dict[str, Any]] = Field(default_factory=list)


class IsometricSnapshot(BaseModel):
    event: dict[str, Any] = Field(default_factory=dict)
    cells: list[IsometricCell] = Field(default_factory=list)
    guards_unassigned: list[dict[str, Any]] = Field(default_factory=list)
    arena_active: list[dict[str, Any]] = Field(default_factory=list)
    alliances_active: int = 0
    ts: str


# Resolve forward ref so EventStatus can reference PlayerMe.
EventStatus.model_rebuild()
