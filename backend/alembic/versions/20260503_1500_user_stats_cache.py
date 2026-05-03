"""user stats cache — total_posts and total_reactions_received columns

Revision ID: 20260503_1500
Revises: 20260503_1300
Create Date: 2026-05-03

Pre-computed counters on users table so we don't N+1 on every post serializer.
Maintained in services.forum and services.shoutbox; backfilled here.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260503_1500"
down_revision: str | None = "20260503_1300"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("total_posts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column(
            "total_reactions_received", sa.Integer(), nullable=False, server_default="0"
        ),
    )

    # Backfill from existing data
    op.execute(
        """
        UPDATE users u
        SET total_posts = COALESCE((
            SELECT COUNT(*) FROM posts p
            WHERE p.author_id = u.id AND p.is_deleted = false
        ), 0)
        """
    )
    op.execute(
        """
        UPDATE users u
        SET total_reactions_received = COALESCE((
            SELECT COUNT(*) FROM reactions r
            JOIN posts p ON p.id = r.post_id
            WHERE p.author_id = u.id
        ), 0)
        """
    )


def downgrade() -> None:
    op.drop_column("users", "total_reactions_received")
    op.drop_column("users", "total_posts")
