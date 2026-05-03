"""Add notifications.updated_at column to satisfy TimestampMixin.

Revision ID: 20260503_2100
Revises: 20260503_1900
Create Date: 2026-05-03

The Notification model inherits TimestampMixin (created_at + updated_at),
but the original migration only created created_at. This adds updated_at
with a server-side default, backfilling existing rows in one shot.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260503_2100"
down_revision: str | None = "20260503_1900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_column("notifications", "updated_at")
