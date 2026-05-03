from __future__ import annotations

from datetime import datetime
from typing import Literal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

ModerationAction = Literal[
    "ban",
    "unban",
    "mute",
    "unmute",
    "thread_lock",
    "thread_unlock",
    "section_lock",
    "section_unlock",
    "post_delete",
    "thread_delete",
    "user_threads_disabled",
    "user_threads_enabled",
    "role_grant",
    "role_revoke",
]


class ModerationLog(Base, TimestampMixin):
    """Append-only audit log of all moderation actions."""

    __tablename__ = "moderation_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    target_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    target_post_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("posts.id", ondelete="SET NULL"), nullable=True
    )
    target_thread_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("threads.id", ondelete="SET NULL"), nullable=True
    )
    target_section_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("sections.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
