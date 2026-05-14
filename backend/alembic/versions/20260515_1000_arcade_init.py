"""arcade module — endless mini-games + monthly leaderboard rewards.

Revision ID: 20260515_1000
Revises: 20260514_2100
Create Date: 2026-05-15

Three tables:
  * arcade_run            — one row per played run (any game)
  * arcade_monthly_winner — frozen monthly top-N (snapshot after rollover)
  * arcade_daily_bonus    — daily-streak tracker (prevent multi-claim)

Game catalog itself is in-process (services/arcade/games.py) — adding
a new game doesn't need a migration.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260515_1000"
down_revision: str | None = "20260514_2100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "arcade_run",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("game_slug", sa.String(length=40), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "seed", sa.BigInteger(), nullable=False, server_default="0",
            comment="server-issued random seed; client must use it",
        ),
        sa.Column(
            "replay", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json"),
            comment="JSON: input_log (compressed), milestones[], meta",
        ),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="pending",
            # pending|ended|flagged|cancelled
        ),
        sa.Column(
            "flagged_reason", sa.String(length=80), nullable=True,
            comment="why anti-cheat rejected this run",
        ),
        sa.Column(
            "client_version", sa.String(length=20), nullable=False,
            server_default="v0",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_arcade_run_game_score",
        "arcade_run", ["game_slug", sa.text("score DESC")],
        postgresql_where=sa.text("status = 'ended'"),
    )
    op.create_index(
        "ix_arcade_run_user_time",
        "arcade_run", ["user_id", sa.text("started_at DESC")],
    )
    op.create_index(
        "ix_arcade_run_monthly",
        "arcade_run", ["game_slug", "ended_at"],
        postgresql_where=sa.text("status = 'ended'"),
    )

    op.create_table(
        "arcade_monthly_winner",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "year_month", sa.String(length=7), nullable=False,
            comment="YYYY-MM string; sortable and human-readable",
        ),
        sa.Column("game_slug", sa.String(length=40), nullable=False),
        sa.Column("rank", sa.SmallInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column(
            "payout_karma", sa.Integer(), nullable=False, server_default="0",
        ),
        sa.Column(
            "payout_keys", sa.SmallInteger(), nullable=False, server_default="0",
        ),
        sa.Column(
            "title_grant", sa.String(length=80), nullable=True,
            comment="temp title applied to user for the next month",
        ),
        sa.Column(
            "frozen_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "year_month", "game_slug", "rank",
            name="uq_arcade_monthly_winner_period_slug_rank",
        ),
    )
    op.create_index(
        "ix_arcade_monthly_winner_period",
        "arcade_monthly_winner", ["year_month", "game_slug", "rank"],
    )

    op.create_table(
        "arcade_daily_bonus",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "claim_date", sa.Date(), nullable=False,
            comment="server-local date (MSK) on which the bonus was claimed",
        ),
        sa.Column(
            "streak_after", sa.SmallInteger(), nullable=False, server_default="1",
        ),
        sa.Column(
            "karma_granted", sa.Integer(), nullable=False, server_default="0",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "user_id", "claim_date",
            name="uq_arcade_daily_bonus_user_date",
        ),
    )


def downgrade() -> None:
    op.drop_table("arcade_daily_bonus")
    op.drop_table("arcade_monthly_winner")
    op.drop_table("arcade_run")
