"""Shoutbox Phase 3: system messages + mapvote polls.

Revision ID: 20260511_1600
Revises: 20260511_1400
Create Date: 2026-05-11

Schema changes:
- shoutbox_messages.kind VARCHAR(16) NOT NULL DEFAULT 'user'
  Discriminator for rendering: 'user' (normal), 'system' (bot-cast killfeed/
  events — monospace grey), 'mapvote' (inline poll widget).
- shoutbox_messages.meta JSONB NULL
  Per-kind payload. For 'system' it carries {tag, category}; for 'mapvote'
  it carries {options: [...], closes_at: iso, server?: str}.
- shoutbox_poll_votes — one vote per (message_id, user_id). Re-voting on
  the same message just moves the vote to a new option (UPDATE).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "20260511_1600"
down_revision: str | None = "20260511_1400"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "shoutbox_messages",
        sa.Column(
            "kind",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'user'"),
        ),
    )
    op.add_column(
        "shoutbox_messages",
        sa.Column("meta", JSONB(), nullable=True),
    )
    op.create_index("ix_shoutbox_messages_kind", "shoutbox_messages", ["kind"])

    op.create_table(
        "shoutbox_poll_votes",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("message_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("option_idx", sa.Integer(), nullable=False),
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
            ["message_id"],
            ["shoutbox_messages.id"],
            ondelete="CASCADE",
            name="fk_shoutbox_poll_votes_message_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_shoutbox_poll_votes_user_id",
        ),
        sa.UniqueConstraint(
            "message_id", "user_id", name="uq_shoutbox_poll_votes_msg_user"
        ),
    )
    op.create_index(
        "ix_shoutbox_poll_votes_message_id",
        "shoutbox_poll_votes",
        ["message_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_shoutbox_poll_votes_message_id", table_name="shoutbox_poll_votes"
    )
    op.drop_table("shoutbox_poll_votes")
    op.drop_index("ix_shoutbox_messages_kind", table_name="shoutbox_messages")
    op.drop_column("shoutbox_messages", "meta")
    op.drop_column("shoutbox_messages", "kind")
