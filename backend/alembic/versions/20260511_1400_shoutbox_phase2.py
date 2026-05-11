"""Shoutbox Phase 2: reply + reactions.

Revision ID: 20260511_1400
Revises: 20260511_1200
Create Date: 2026-05-11

Schema changes:
- shoutbox_messages.reply_to_id BIGINT NULL — self-FK, ondelete SET NULL.
  Lets a chat message quote another. Index added for hot lookups.
- New table shoutbox_reactions — same 7-kind enum as forum posts:
  like/fire/laugh/wow/sad/thinking/thanks. Unique(message_id, user_id, kind)
  to enforce one-toggle-per-kind.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_1400"
down_revision: str | None = "20260511_1200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "shoutbox_messages",
        sa.Column("reply_to_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_shoutbox_messages_reply_to_id_self",
        "shoutbox_messages",
        "shoutbox_messages",
        ["reply_to_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_shoutbox_messages_reply_to_id",
        "shoutbox_messages",
        ["reply_to_id"],
    )

    op.create_table(
        "shoutbox_reactions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("message_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
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
            name="fk_shoutbox_reactions_message_id_msgs",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_shoutbox_reactions_user_id_users",
        ),
        sa.UniqueConstraint(
            "message_id", "user_id", "kind", name="uq_shoutbox_reactions_msg_user_kind"
        ),
    )
    op.create_index(
        "ix_shoutbox_reactions_message_id", "shoutbox_reactions", ["message_id"]
    )
    op.create_index(
        "ix_shoutbox_reactions_user_id", "shoutbox_reactions", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_shoutbox_reactions_user_id", table_name="shoutbox_reactions")
    op.drop_index(
        "ix_shoutbox_reactions_message_id", table_name="shoutbox_reactions"
    )
    op.drop_table("shoutbox_reactions")

    op.drop_index(
        "ix_shoutbox_messages_reply_to_id", table_name="shoutbox_messages"
    )
    op.drop_constraint(
        "fk_shoutbox_messages_reply_to_id_self",
        "shoutbox_messages",
        type_="foreignkey",
    )
    op.drop_column("shoutbox_messages", "reply_to_id")
