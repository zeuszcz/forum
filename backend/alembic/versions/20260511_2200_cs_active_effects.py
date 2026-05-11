"""cs_active_effects — runtime state of jbf_uaio effects per player.

Revision ID: 20260511_2200
Revises: 20260511_1900
Create Date: 2026-05-11

Composite PK (steamid, effect_slug): one row per (player, effect). UPSERT
on grant, DELETE on revoke. `expires_at` carried for timed effects so the
frontend can render a countdown without polling the CS server.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_2200"
down_revision: str | None = "20260511_1900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cs_active_effects",
        sa.Column("steamid", sa.String(length=64), nullable=False),
        sa.Column("effect_slug", sa.String(length=64), nullable=False),
        sa.Column("effect_label", sa.String(length=128), nullable=False),
        sa.Column("effect_emoji", sa.String(length=8), nullable=True),
        sa.Column("granted_by_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("command", sa.String(length=500), nullable=False),
        sa.Column("player_nick", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("steamid", "effect_slug"),
        sa.ForeignKeyConstraint(
            ["granted_by_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_cs_active_effects_granted_by_id",
        ),
    )
    op.create_index(
        "ix_cs_active_effects_expires_at",
        "cs_active_effects",
        ["expires_at"],
        postgresql_where=sa.text("expires_at IS NOT NULL"),
    )
    op.create_index(
        "ix_cs_active_effects_steamid",
        "cs_active_effects",
        ["steamid"],
    )


def downgrade() -> None:
    op.drop_index("ix_cs_active_effects_steamid", table_name="cs_active_effects")
    op.drop_index("ix_cs_active_effects_expires_at", table_name="cs_active_effects")
    op.drop_table("cs_active_effects")
