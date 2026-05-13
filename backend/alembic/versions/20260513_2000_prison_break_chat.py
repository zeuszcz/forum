"""prison_break EPIC 2 — cell chat + extras.

Revision ID: 20260513_2000
Revises: 20260513_1500
Create Date: 2026-05-13

Adds:
  * prison_break_cell_message — per-cell chat thread
  * prison_break_event_log — broadcasted live events for the activity feed
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260513_2000"
down_revision: str | None = "20260513_1500"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "prison_break_cell_message",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("cell_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cell_id"], ["prison_break_cell.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["prison_break_player.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_prison_break_cell_message_cell_time",
        "prison_break_cell_message", ["cell_id", sa.text("created_at DESC")],
    )

    op.create_table(
        "prison_break_event_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False, server_default="public"),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_prison_break_event_log_event_time",
        "prison_break_event_log", ["event_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_table("prison_break_event_log")
    op.drop_table("prison_break_cell_message")
