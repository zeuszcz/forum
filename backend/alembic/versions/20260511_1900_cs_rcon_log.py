"""cs_rcon_log audit table for /cs-rcon/execute.

Revision ID: 20260511_1900
Revises: 20260511_1600
Create Date: 2026-05-11
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_1900"
down_revision: str | None = "20260511_1600"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cs_rcon_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("actor_id", sa.BigInteger(), nullable=True),
        sa.Column("command", sa.String(length=500), nullable=False),
        sa.Column("response", sa.String(length=4000), nullable=True),
        sa.Column(
            "success",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
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
            ["actor_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_cs_rcon_log_actor_id_users",
        ),
    )
    op.create_index("ix_cs_rcon_log_actor_id", "cs_rcon_log", ["actor_id"])
    op.create_index(
        "ix_cs_rcon_log_created_at",
        "cs_rcon_log",
        [sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_cs_rcon_log_created_at", table_name="cs_rcon_log")
    op.drop_index("ix_cs_rcon_log_actor_id", table_name="cs_rcon_log")
    op.drop_table("cs_rcon_log")
