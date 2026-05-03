from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ShoutboxMessage(Base, TimestampMixin):
    """Short messages on the home page general chat. Trimmed to last N rows by service."""

    __tablename__ = "shoutbox_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    author_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    body: Mapped[str] = mapped_column(String(280), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
