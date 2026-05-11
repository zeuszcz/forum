from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ShoutboxMessage(Base, TimestampMixin):
    """Short messages on the home page general chat. Trimmed to last N rows by service."""

    __tablename__ = "shoutbox_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    author_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    body: Mapped[str] = mapped_column(String(500), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    is_pinned: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reply_to_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("shoutbox_messages.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    # Discriminator for rendering: 'user' (default), 'system' (bot-cast),
    # 'mapvote' (inline poll). 'meta' is the per-kind JSON payload.
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="user", server_default="user", index=True
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class ShoutboxPollVote(Base, TimestampMixin):
    """One vote per (message_id, user_id) on a mapvote-kind shoutbox message.
    Re-voting on the same poll just UPDATEs option_idx — no audit history."""

    __tablename__ = "shoutbox_poll_votes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    message_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("shoutbox_messages.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    option_idx: Mapped[int] = mapped_column(Integer, nullable=False)


class ShoutboxReaction(Base, TimestampMixin):
    """One row per (message, user, kind). Re-toggling deletes the row."""

    __tablename__ = "shoutbox_reactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    message_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("shoutbox_messages.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="like")


class ChatMute(Base, TimestampMixin):
    """Chat-only timeout. Distinct from `users.muted_until` (full forum mute):
    a chat_mute only blocks shoutbox posting, not threads/replies.
    """

    __tablename__ = "chat_mutes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    reason: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
