from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UserPerkGrant(Base, TimestampMixin):
    """A time-bounded perk grant.

    Permanent grants live in users.granted_perks (ARRAY of slugs). Time-bounded
    grants — typically from cases — live here so each grant has an explicit
    expires_at. The effective set of active perks for a user is:

        granted_perks ∪ {row.perk_slug : row.expires_at IS NULL OR > now()}

    Source examples:
        case:starter   — drop from a case opening
        admin:gift     — granted by staff via admin panel
        quest:streak   — bonus from quest streak (future)
    """

    __tablename__ = "user_perk_grants"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    perk_slug: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
