from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CsRconLog(Base, TimestampMixin):
    """Audit row for every `/cs-rcon/execute` call. Keeps the forum-side
    record of *who* triggered which command — distinct from the in-game
    plugin log (which only sees `Console` as the actor when commands come
    via RCON)."""

    __tablename__ = "cs_rcon_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    command: Mapped[str] = mapped_column(String(500), nullable=False)
    response: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    success: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
