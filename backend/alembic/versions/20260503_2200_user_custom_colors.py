"""Add user nick_color + avatar_glow_color columns.

Revision ID: 20260503_2200
Revises: 20260503_2100
Create Date: 2026-05-03

Both columns are nullable hex strings (e.g. "#7c5cff" or "#7c5cffff").
Population is gated by perks at the API layer: nick_color requires
glow_nick, avatar_glow_color requires animated_frame.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260503_2200"
down_revision: str | None = "20260503_2100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nick_color", sa.String(9), nullable=True))
    op.add_column("users", sa.Column("avatar_glow_color", sa.String(9), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_glow_color")
    op.drop_column("users", "nick_color")
