"""prison_break EPIC 6 — arena loadout column on player.

Revision ID: 20260514_1800
Revises: 20260514_1500
Create Date: 2026-05-14

Adds a single JSON column `arena_loadout` to `prison_break_player`. Holds:
  {
    "specials": ["punch_jab", "kick_round", "shiv_strike"],  # exactly 3 slugs
    "wins": 0,
    "losses": 0,
    "updated_at": "...",
  }
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260514_1800"
down_revision: str | None = "20260514_1500"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "prison_break_player",
        sa.Column(
            "arena_loadout",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
            comment="EPIC 6 arena setup: chosen specials + win/loss tally",
        ),
    )


def downgrade() -> None:
    op.drop_column("prison_break_player", "arena_loadout")
