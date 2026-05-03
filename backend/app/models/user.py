from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String
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

    # ---- Moderation state ----
    is_banned: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    ban_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_muted: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    mute_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    can_create_threads: Mapped[bool] = mapped_column(default=True, nullable=False)
