"""Shoutbox Phase 1: pin/edit + chat-specific mute + 500 char body.

Revision ID: 20260511_1200
Revises: 20260504_2200
Create Date: 2026-05-11

Schema changes:
- shoutbox_messages.body: VARCHAR(280) -> VARCHAR(500)
- shoutbox_messages.is_pinned BOOLEAN NOT NULL DEFAULT false (1 pin slot for staff)
- shoutbox_messages.edited_at TIMESTAMPTZ NULL
- New table chat_mutes — chat-only timeout (does NOT mute the user from the forum).
  Columns: user_id (unique), until, reason, created_by_id, created_at, updated_at.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_1200"
down_revision: str | None = "20260504_2200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "shoutbox_messages",
        "body",
        existing_type=sa.String(length=280),
        type_=sa.String(length=500),
        existing_nullable=False,
    )
    op.add_column(
        "shoutbox_messages",
        sa.Column(
            "is_pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "shoutbox_messages",
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_shoutbox_messages_is_pinned",
        "shoutbox_messages",
        ["is_pinned"],
    )

    op.create_table(
        "chat_mutes",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(length=256), nullable=True),
        sa.Column("created_by_id", sa.BigInteger(), nullable=True),
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
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_chat_mutes_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_chat_mutes_created_by_id_users",
        ),
        sa.UniqueConstraint("user_id", name="uq_chat_mutes_user_id"),
    )
    op.create_index("ix_chat_mutes_until", "chat_mutes", ["until"])


def downgrade() -> None:
    op.drop_index("ix_chat_mutes_until", table_name="chat_mutes")
    op.drop_table("chat_mutes")
    op.drop_index("ix_shoutbox_messages_is_pinned", table_name="shoutbox_messages")
    op.drop_column("shoutbox_messages", "edited_at")
    op.drop_column("shoutbox_messages", "is_pinned")
    op.alter_column(
        "shoutbox_messages",
        "body",
        existing_type=sa.String(length=500),
        type_=sa.String(length=280),
        existing_nullable=False,
    )
