"""polls + user birthday/streak/karma + notifications

Revision ID: 20260503_1900
Revises: 20260503_1700
Create Date: 2026-05-03

Adds:
- users.birthday (DATE, nullable)
- users.streak_days, users.last_active_date — daily streak counter
- users.karma (cached integer)
- polls (one per thread max), poll_options, poll_votes
- notifications (real, replaces frontend mock)
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260503_1900"
down_revision: str | None = "20260503_1700"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- User extras ---
    op.add_column("users", sa.Column("birthday", sa.Date(), nullable=True))
    op.add_column(
        "users",
        sa.Column("streak_days", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("last_active_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("karma", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_users_birthday", "users", ["birthday"])

    # --- Polls ---
    op.create_table(
        "polls",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("thread_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("question", sa.String(280), nullable=False),
        sa.Column("multi", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("closed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["thread_id"], ["threads.id"], ondelete="CASCADE", name="fk_polls_thread_id_threads"
        ),
    )
    op.create_index("ix_polls_thread_id", "polls", ["thread_id"], unique=True)

    op.create_table(
        "poll_options",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("poll_id", sa.BigInteger(), nullable=False),
        sa.Column("text", sa.String(120), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["poll_id"], ["polls.id"], ondelete="CASCADE", name="fk_poll_options_poll_id_polls"
        ),
    )
    op.create_index("ix_poll_options_poll_id", "poll_options", ["poll_id"])

    op.create_table(
        "poll_votes",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("poll_id", sa.BigInteger(), nullable=False),
        sa.Column("option_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["poll_id"], ["polls.id"], ondelete="CASCADE", name="fk_poll_votes_poll_id_polls"
        ),
        sa.ForeignKeyConstraint(
            ["option_id"],
            ["poll_options.id"],
            ondelete="CASCADE",
            name="fk_poll_votes_option_id_poll_options",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE", name="fk_poll_votes_user_id_users"
        ),
        sa.UniqueConstraint(
            "poll_id", "option_id", "user_id", name="uq_poll_votes_poll_opt_user"
        ),
    )
    op.create_index("ix_poll_votes_poll_id", "poll_votes", ["poll_id"])
    op.create_index("ix_poll_votes_user_id", "poll_votes", ["user_id"])

    # --- Notifications ---
    op.create_table(
        "notifications",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.String(500), nullable=True),
        sa.Column("href", sa.String(500), nullable=True),
        sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_notifications_user_id_users",
        ),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_read", "notifications", ["read"])
    op.create_index(
        "ix_notifications_user_read_created",
        "notifications",
        ["user_id", "read", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("poll_votes")
    op.drop_table("poll_options")
    op.drop_table("polls")
    op.drop_index("ix_users_birthday", table_name="users")
    op.drop_column("users", "karma")
    op.drop_column("users", "last_active_date")
    op.drop_column("users", "streak_days")
    op.drop_column("users", "birthday")
