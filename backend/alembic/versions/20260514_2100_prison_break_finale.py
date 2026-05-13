"""prison_break EPIC 7 — finale votes + revealed_role flag.

Revision ID: 20260514_2100
Revises: 20260514_1800
Create Date: 2026-05-14

Adds:
  * prison_break_final_vote — one row per (event, voter, kind) for the
    Final Night vote (boss / snitch / hero categories)
  * prison_break_player.revealed_role — server-set string when a
    Reveal event has exposed the player's role to everyone
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260514_2100"
down_revision: str | None = "20260514_1800"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Vote table — one row per (event_id, voter_id, kind).
    op.create_table(
        "prison_break_final_vote",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("voter_id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column(
            "kind", sa.String(length=20), nullable=False,
            # boss | snitch | hero
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["prison_break_event.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["voter_id"], ["prison_break_player.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_id"], ["prison_break_player.id"], ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "event_id", "voter_id", "kind",
            name="uq_prison_break_final_vote_event_voter_kind",
        ),
    )
    op.create_index(
        "ix_prison_break_final_vote_event_kind",
        "prison_break_final_vote",
        ["event_id", "kind"],
    )

    # Revealed role — set by reveal_service when a role_reveal fires.
    op.add_column(
        "prison_break_player",
        sa.Column(
            "revealed_role", sa.String(length=20), nullable=True,
            comment="role visible to all players once a Reveal exposed it",
        ),
    )


def downgrade() -> None:
    op.drop_column("prison_break_player", "revealed_role")
    op.drop_table("prison_break_final_vote")
