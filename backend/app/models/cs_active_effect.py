from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CsActiveEffect(Base):
    """Forum-side state of which jbf_uaio effects are currently on which
    players. Updated by POST /cs-rcon/action; the server itself doesn't
    expose effect-state via RCON, so we track our own dispatches.

    Composite PK (steamid, effect_slug): only one row per pair — granting
    again UPSERT-s, revoking DELETE-s."""

    __tablename__ = "cs_active_effects"

    steamid: Mapped[str] = mapped_column(String(64), primary_key=True)
    effect_slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    effect_label: Mapped[str] = mapped_column(String(128), nullable=False)
    effect_emoji: Mapped[str | None] = mapped_column(String(8), nullable=True)
    granted_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    command: Mapped[str] = mapped_column(String(500), nullable=False)
    player_nick: Mapped[str | None] = mapped_column(String(64), nullable=True)
