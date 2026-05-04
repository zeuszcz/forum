from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DailyQuest(Base, TimestampMixin):
    """Catalog of quest templates that can be rolled to users daily."""

    __tablename__ = "daily_quests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Tracked progress kind. Currently:
    #   post_count       — write N (non-OP) posts today
    #   thread_count     — start N new threads today
    #   react_given      — react N times today (any kind)
    #   react_received   — receive N reactions on your posts today
    requirement_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    requirement_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reward_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class UserDailyQuest(Base, TimestampMixin):
    """Per-user per-day quest assignment + progress."""

    __tablename__ = "user_daily_quests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    quest_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("daily_quests.id", ondelete="CASCADE"), index=True, nullable=False
    )
    day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
