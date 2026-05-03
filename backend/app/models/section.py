from __future__ import annotations

from sqlalchemy import BigInteger, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Section(Base, TimestampMixin):
    """Forum category — flat list for MVP. Nested in Phase 2."""

    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(32), nullable=False, default="message-square")
    accent: Mapped[str] = mapped_column(String(16), nullable=False, default="plasma")  # plasma|flame|cyan|ember
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_locked: Mapped[bool] = mapped_column(default=False, nullable=False)
    requires_role_slug: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Cached counters for fast index render
    thread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    post_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_thread_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
