"""prison_break ORM models — mirrors the alembic migration 20260513_1500.

This is the model-side companion to the 13-table schema. Imports are kept
flat — one file, easy to scan. All models inherit from `Base + TimestampMixin`
where appropriate to match the rest of the project.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    ARRAY,
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PrisonBreakEvent(Base):
    """Single event (season). Status lifecycle: draft → signup → active → finished."""

    __tablename__ = "prison_break_event"
    __table_args__ = (UniqueConstraint("season", name="uq_prison_break_event_season"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    season: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False, default="Тюремный Бунт")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    current_phase: Mapped[str] = mapped_column(String(20), nullable=False, default="setup")
    current_day: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    signup_opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PrisonBreakPlayer(Base):
    """Per-user registration into an event. Role assigned at Day 0 by service."""

    __tablename__ = "prison_break_player"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_prison_break_player_event_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    nickname: Mapped[str] = mapped_column(String(32), nullable=False)
    tattoo: Mapped[str] = mapped_column(String(8), nullable=False)
    article: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    faction: Mapped[str | None] = mapped_column(String(20), nullable=True)
    block: Mapped[str | None] = mapped_column(String(1), nullable=True)
    cell_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("prison_break_cell.id", ondelete="SET NULL"), nullable=True
    )
    ap_current: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3)
    ap_max: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3)
    money: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resource_scrap: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resource_paper: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    welcome_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    eliminated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PrisonBreakCell(Base):
    """One cell — 4 prisoners. Tunnel progress is owned by the cell."""

    __tablename__ = "prison_break_cell"
    __table_args__ = (
        UniqueConstraint(
            "event_id", "block", "number", name="uq_prison_break_cell_event_block_number",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    block: Mapped[str] = mapped_column(String(1), nullable=False)
    number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    tunnel_progress: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    tunnel_discovered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    camera_disabled_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PrisonBreakAction(Base):
    """Every AP-spend event. Idempotency-keyed for safe client retries."""

    __tablename__ = "prison_break_action"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="SET NULL"), nullable=True
    )
    action_type: Mapped[str] = mapped_column(String(40), nullable=False)
    ap_spent: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    extra: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, nullable=False, default=dict)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PrisonBreakIntel(Base):
    """Intel atom — visible to specific players via PrisonBreakIntelView."""

    __tablename__ = "prison_break_intel"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_truth: Mapped[bool] = mapped_column(Boolean, nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    about_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    about_cell_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fabricated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PrisonBreakIntelView(Base):
    """Pivot: which player has seen which intel piece (and from whom)."""

    __tablename__ = "prison_break_intel_view"

    intel_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("prison_break_intel.id", ondelete="CASCADE"), primary_key=True
    )
    viewer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), primary_key=True
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    forwarded_from_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="SET NULL"), nullable=True
    )


class PrisonBreakInventory(Base):
    """An item instance held by a player. Quality affects effect strength."""

    __tablename__ = "prison_break_inventory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    owner_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    item_type: Mapped[str] = mapped_column(String(30), nullable=False)
    quality: Mapped[str] = mapped_column(String(20), nullable=False, default="good")
    extra: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, nullable=False, default=dict)
    acquired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PrisonBreakTrust(Base):
    """Pairwise trust score 0-100. user_a < user_b by check constraint."""

    __tablename__ = "prison_break_trust"
    __table_args__ = (
        CheckConstraint("user_a < user_b", name="ck_prison_break_trust_order"),
        CheckConstraint("score BETWEEN 0 AND 100", name="ck_prison_break_trust_bounds"),
    )

    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), primary_key=True
    )
    user_a: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), primary_key=True
    )
    user_b: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), primary_key=True
    )
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=50)
    last_change_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PrisonBreakAlliance(Base):
    """Formal alliance / pact between 2+ players."""

    __tablename__ = "prison_break_alliance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    parties: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    pact_type: Mapped[str] = mapped_column(String(30), nullable=False)
    terms: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")
    proposed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    broken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    broken_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="SET NULL"), nullable=True
    )


class PrisonBreakArenaMatch(Base):
    """2D arena fight record."""

    __tablename__ = "prison_break_arena_match"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    player_a_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    player_b_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    winner_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replay: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class PrisonBreakArenaBet(Base):
    """Spectator bet on an arena match."""

    __tablename__ = "prison_break_arena_bet"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    match_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("prison_break_arena_match.id", ondelete="CASCADE"), nullable=False
    )
    bettor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    on_player_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    odds: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    placed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payout: Mapped[int | None] = mapped_column(Integer, nullable=True)


class PrisonBreakMarketOrder(Base):
    """Black-market order. Matching engine in services/prison_break/market.py."""

    __tablename__ = "prison_break_market_order"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    owner_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    side: Mapped[str] = mapped_column(String(4), nullable=False)  # bid|ask
    resource: Mapped[str] = mapped_column(String(20), nullable=False)
    qty_total: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_remaining: Mapped[int] = mapped_column(Integer, nullable=False)
    price_per_unit: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PrisonBreakReveal(Base):
    """Scheduled or already-happened reveal phase event."""

    __tablename__ = "prison_break_reveal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    day: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    reveal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
