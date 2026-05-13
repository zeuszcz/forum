"""Additional ORM models for EPIC 2 — cell chat + event log."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
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
