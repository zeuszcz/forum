"""Additional ORM models for prison_break EPICs 2 + 5.

EPIC 2 — cell chat + event log
EPIC 5 — lock-pick session, patrol plan, interrogation + turns
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PrisonBreakCellMessage(Base):
    """Cell-private chat message — visible only to cell members."""

    __tablename__ = "prison_break_cell_message"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    cell_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_cell.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PrisonBreakEventLog(Base):
    """Broadcasted live event for the activity feed. Visibility:
    public  — everyone in the event sees this
    faction — only members of the actor's faction
    cell    — only the actor's cellmates
    private — only the actor + the explicit target
    """

    __tablename__ = "prison_break_event_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="public")
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# ---------------------------------------------------------------------------
# EPIC 5 — Lock-pick / Patrol planner / Interrogation
# ---------------------------------------------------------------------------


class PrisonBreakLockpickSession(Base):
    """One pin-tumbler attempt. Server hides pin_sequence."""

    __tablename__ = "prison_break_lockpick_session"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    target_cell_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_cell.id", ondelete="CASCADE"), nullable=False
    )
    difficulty: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3)
    pin_sequence: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    key_quality: Mapped[str] = mapped_column(String(20), nullable=False, default="good")
    forgive_misses: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    current_pin: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    misses: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


class PrisonBreakPatrolPlan(Base):
    """A guard's planned route for one event day."""

    __tablename__ = "prison_break_patrol_plan"
    __table_args__ = (
        UniqueConstraint(
            "guard_id", "valid_for_day",
            name="uq_prison_break_patrol_guard_day",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    guard_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    block: Mapped[str] = mapped_column(String(1), nullable=False)
    route: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    focus: Mapped[str] = mapped_column(String(20), nullable=False, default="balanced")
    valid_for_day: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    executed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    executed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PrisonBreakInterrogation(Base):
    """Multi-round Q&A session between an interrogator and a suspect."""

    __tablename__ = "prison_break_interrogation"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_event.id", ondelete="CASCADE"), nullable=False
    )
    interrogator_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    suspect_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    topic: Mapped[str] = mapped_column(String(30), nullable=False, default="general")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    rounds_remaining: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3)
    pressure: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=50)
    trust_loss: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


class PrisonBreakInterrogationTurn(Base):
    """One Q or A line in an interrogation transcript."""

    __tablename__ = "prison_break_interrogation_turn"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    interrogation_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("prison_break_interrogation.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    speaker_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prison_break_player.id", ondelete="CASCADE"), nullable=False
    )
    tactic: Mapped[str] = mapped_column(String(20), nullable=False, default="ask")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    delta_pressure: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
