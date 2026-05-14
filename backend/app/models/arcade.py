"""arcade ORM models — endless mini-games + monthly leaderboard.

Schema lives in migration 20260515_1000_arcade_init.py.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ArcadeRun(Base):
    """One played run of any arcade game."""

    __tablename__ = "arcade_run"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    game_slug: Mapped[str] = mapped_column(String(40), nullable=False)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    replay: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    flagged_reason: Mapped[str | None] = mapped_column(String(80), nullable=True)
    client_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v0")


class ArcadeMonthlyWinner(Base):
    """Frozen monthly podium row."""

    __tablename__ = "arcade_monthly_winner"
    __table_args__ = (
        UniqueConstraint(
            "year_month", "game_slug", "rank",
            name="uq_arcade_monthly_winner_period_slug_rank",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year_month: Mapped[str] = mapped_column(String(7), nullable=False)
    game_slug: Mapped[str] = mapped_column(String(40), nullable=False)
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    payout_karma: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payout_keys: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    title_grant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    frozen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ArcadeDailyBonus(Base):
    """Daily-streak claim record."""

    __tablename__ = "arcade_daily_bonus"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "claim_date",
            name="uq_arcade_daily_bonus_user_date",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    claim_date: Mapped[date] = mapped_column(Date, nullable=False)
    streak_after: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    karma_granted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
