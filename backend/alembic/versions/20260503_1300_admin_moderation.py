"""admin moderation — user restriction fields + moderation_log table

Revision ID: 20260503_1300
Revises: 20260503_0000
Create Date: 2026-05-03

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260503_1300"
down_revision: str | None = "20260503_0000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # User restrictions ---------------------------------------------------
    op.add_column(
        "users",
        sa.Column("is_banned", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("ban_reason", sa.String(500), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("banned_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("is_muted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("mute_reason", sa.String(500), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("muted_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "can_create_threads",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )

    op.create_index("ix_users_is_banned", "users", ["is_banned"])
    op.create_index("ix_users_is_muted", "users", ["is_muted"])

    # Moderation log ------------------------------------------------------
    op.create_table(
        "moderation_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("actor_id", sa.BigInteger(), nullable=True),
        sa.Column("target_user_id", sa.BigInteger(), nullable=True),
        sa.Column("target_post_id", sa.BigInteger(), nullable=True),
        sa.Column("target_thread_id", sa.BigInteger(), nullable=True),
        sa.Column("target_section_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], ondelete="SET NULL", name="fk_moderation_log_actor_id_users"
        ),
        sa.ForeignKeyConstraint(
            ["target_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_moderation_log_target_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["target_post_id"],
            ["posts.id"],
            ondelete="SET NULL",
            name="fk_moderation_log_target_post_id_posts",
        ),
        sa.ForeignKeyConstraint(
            ["target_thread_id"],
            ["threads.id"],
            ondelete="SET NULL",
            name="fk_moderation_log_target_thread_id_threads",
        ),
        sa.ForeignKeyConstraint(
            ["target_section_id"],
            ["sections.id"],
            ondelete="SET NULL",
            name="fk_moderation_log_target_section_id_sections",
        ),
    )
    op.create_index("ix_moderation_log_actor_id", "moderation_log", ["actor_id"])
    op.create_index("ix_moderation_log_target_user_id", "moderation_log", ["target_user_id"])
    op.create_index("ix_moderation_log_action", "moderation_log", ["action"])
    op.create_index("ix_moderation_log_created_at", "moderation_log", ["created_at"])


def downgrade() -> None:
    op.drop_table("moderation_log")
    op.drop_index("ix_users_is_muted", table_name="users")
    op.drop_index("ix_users_is_banned", table_name="users")
    op.drop_column("users", "can_create_threads")
    op.drop_column("users", "muted_until")
    op.drop_column("users", "mute_reason")
    op.drop_column("users", "is_muted")
    op.drop_column("users", "banned_until")
    op.drop_column("users", "ban_reason")
    op.drop_column("users", "is_banned")
