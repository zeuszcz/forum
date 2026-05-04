from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nickname: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    steam_id: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True, index=True)

    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    signature: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(default=False, nullable=False)

    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ---- Cached stats (services maintain; migration backfills) ----
    total_posts: Mapped[int] = mapped_column(default=0, nullable=False)
    total_reactions_received: Mapped[int] = mapped_column(default=0, nullable=False)
    # Subset of total_reactions_received counting only kind='thanks' — used
    # as a separate "reputation" metric in profile + post sidebars.
    thanks_received: Mapped[int] = mapped_column(default=0, nullable=False)

    # ---- Moderation state ----
    is_banned: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    ban_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_muted: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    mute_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    can_create_threads: Mapped[bool] = mapped_column(default=True, nullable=False)

    # Manually-granted perks that bypass the level gate
    # Allowed values: "custom_title", "glow_nick", "animated_frame"
    granted_perks: Mapped[list[str]] = mapped_column(
        ARRAY(String(32)), nullable=False, default=list, server_default="{}"
    )

    # Profile extras (migration 20260503_1900)
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    streak_days: Mapped[int] = mapped_column(default=0, nullable=False)
    last_active_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    karma: Mapped[int] = mapped_column(default=0, nullable=False)

    # Custom personal colors (migration 20260503_2200) — gated by perks at API level
    # nick_color requires `glow_nick`; avatar_glow_color requires `animated_frame`
    nick_color: Mapped[str | None] = mapped_column(String(9), nullable=True)
    avatar_glow_color: Mapped[str | None] = mapped_column(String(9), nullable=True)
