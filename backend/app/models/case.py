from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Case(Base, TimestampMixin):
    """Container of possible rewards. Costs `key_cost` keys to open."""

    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(32), nullable=False, default="package")
    accent: Mapped[str] = mapped_column(String(16), nullable=False, default="plasma")
    key_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CaseItem(Base, TimestampMixin):
    """One possible drop from a case. Reward kinds:
       'xp'   → reward_value bonus XP
       'perk' → reward_payload is a perk slug (custom_title, glow_nick, …)
       'currency'→ reward_value gold coins (in-app currency, MVP unused)
    """

    __tablename__ = "case_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cases.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    rarity: Mapped[str] = mapped_column(String(16), nullable=False, default="common")
    # Loot table weight — higher = more likely. Probability = weight / total
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    reward_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="xp")
    reward_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_payload: Mapped[str | None] = mapped_column(String(64), nullable=True)
    icon_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Duration in days for perk-kind rewards. NULL = permanent. 7/30/90 used for
    # rotating server privileges + cosmetics.
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)


class UserKey(Base, TimestampMixin):
    """A key the user can spend to open a case. Earned via daily quests
    completion or admin grants. Soft-tracked as a counter on users.case_keys
    too — this table records the audit trail."""

    __tablename__ = "user_keys"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    granted_for: Mapped[str] = mapped_column(String(64), nullable=False, default="quest_completed")
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CaseOpening(Base, TimestampMixin):
    """Audit log of case openings + reward record."""

    __tablename__ = "case_openings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    case_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cases.id", ondelete="CASCADE"), index=True, nullable=False
    )
    case_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("case_items.id", ondelete="CASCADE"), nullable=False
    )
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
