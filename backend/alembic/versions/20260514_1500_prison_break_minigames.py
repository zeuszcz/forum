"""prison_break EPIC 5 — lock-pick + patrol planner + interrogation tables.

Revision ID: 20260514_1500
Revises: 20260513_2000
Create Date: 2026-05-14

Four new tables:
  * prison_break_lockpick_session   — active pin-tumbler attempts
  * prison_break_patrol_plan        — guard's saved patrol routes
  * prison_break_interrogation      — interrogation sessions
  * prison_break_interrogation_turn — Q&A transcript per session
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260514_1500"
down_revision: str | None = "20260513_2000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1) LOCKPICK_SESSION — one row per active or finished attempt.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_lockpick_session",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column(
            "target_cell_id", sa.Integer(), nullable=False,
            comment="cell being broken into — defines difficulty",
        ),
        sa.Column(
            "difficulty", sa.SmallInteger(), nullable=False, server_default="3",
            comment="number of pins (3..7); higher = harder",
        ),
        sa.Column(
            "pin_sequence", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json"),
            comment="server-side ordered pin order, hidden from client",
        ),
        sa.Column(
            "key_quality", sa.String(length=20), nullable=False, server_default="good",
            comment="quality of the forged_key consumed — affects forgive_misses",
        ),
        sa.Column(
            "forgive_misses", sa.SmallInteger(), nullable=False, server_default="1",
            comment="how many wrong taps the session tolerates",
        ),
        sa.Column(
            "current_pin", sa.SmallInteger(), nullable=False, server_default="0",
            comment="index of next pin to set",
        ),
        sa.Column(
            "misses", sa.SmallInteger(), nullable=False, server_default="0",
        ),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="active",
            # active|won|lost|abandoned|expired
        ),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "outcome", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json"),
            comment="post-game payload: moved_to_cell, intel_dropped, etc.",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["prison_break_event.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["prison_break_player.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_cell_id"], ["prison_break_cell.id"], ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_prison_break_lockpick_actor",
        "prison_break_lockpick_session",
        ["actor_id", sa.text("started_at DESC")],
    )
    # Only one active session per actor at a time.
    op.create_index(
        "ix_prison_break_lockpick_active_unique",
        "prison_break_lockpick_session", ["actor_id"],
        unique=True, postgresql_where=sa.text("status = 'active'"),
    )

    # ------------------------------------------------------------------
    # 2) PATROL_PLAN — guard pre-commits a route through their block.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_patrol_plan",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("guard_id", sa.Integer(), nullable=False),
        sa.Column("block", sa.String(length=1), nullable=False),
        sa.Column(
            "route", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json"),
            comment="ordered list of cell IDs the guard plans to visit",
        ),
        sa.Column(
            "focus", sa.String(length=20), nullable=False, server_default="balanced",
            # balanced|aggressive|stealth — affects detection chance + AP cost
        ),
        sa.Column(
            "valid_for_day", sa.SmallInteger(), nullable=False,
            comment="which event day this plan is active for",
        ),
        sa.Column(
            "executed", sa.Boolean(), nullable=False, server_default=sa.false(),
        ),
        sa.Column(
            "executed_at", sa.DateTime(timezone=True), nullable=True,
        ),
        sa.Column(
            "result", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json"),
            comment="per-cell visit results once executed: detected, scuffed, empty",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["prison_break_event.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["guard_id"], ["prison_break_player.id"], ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "guard_id", "valid_for_day",
            name="uq_prison_break_patrol_guard_day",
        ),
    )
    op.create_index(
        "ix_prison_break_patrol_event_day",
        "prison_break_patrol_plan", ["event_id", "valid_for_day"],
    )

    # ------------------------------------------------------------------
    # 3) INTERROGATION — multi-round Q&A session.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_interrogation",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("interrogator_id", sa.Integer(), nullable=False),
        sa.Column("suspect_id", sa.Integer(), nullable=False),
        sa.Column(
            "topic", sa.String(length=30), nullable=False, server_default="general",
            # general|tunnel|alliance|intel_leak|role
        ),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="active",
            # active|confession|silence|frame|expired|aborted
        ),
        sa.Column(
            "rounds_remaining", sa.SmallInteger(), nullable=False, server_default="3",
        ),
        sa.Column(
            "pressure", sa.SmallInteger(), nullable=False, server_default="50",
            comment="0..100 — when above 80 the suspect is forced to confess",
        ),
        sa.Column(
            "trust_loss", sa.SmallInteger(), nullable=False, server_default="0",
            comment="cumulative trust hit applied when the session resolves",
        ),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "outcome", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json"),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["prison_break_event.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["interrogator_id"], ["prison_break_player.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["suspect_id"], ["prison_break_player.id"], ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_prison_break_interrogation_active",
        "prison_break_interrogation",
        ["interrogator_id", "suspect_id"],
        unique=True, postgresql_where=sa.text("status = 'active'"),
    )

    # ------------------------------------------------------------------
    # 4) INTERROGATION_TURN — one row per Q or A line.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_interrogation_turn",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("interrogation_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "role", sa.String(length=20), nullable=False,
            # question|answer|system
        ),
        sa.Column(
            "speaker_id", sa.Integer(), nullable=False,
            comment="interrogator_id or suspect_id",
        ),
        sa.Column(
            "tactic", sa.String(length=20), nullable=False, server_default="ask",
            # ask|bluff|threat|offer|truth|lie|silence
        ),
        sa.Column(
            "body", sa.Text(), nullable=False, server_default="",
        ),
        sa.Column(
            "delta_pressure", sa.SmallInteger(), nullable=False, server_default="0",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["interrogation_id"],
            ["prison_break_interrogation.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["speaker_id"],
            ["prison_break_player.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_prison_break_interrogation_turn_session",
        "prison_break_interrogation_turn",
        ["interrogation_id", "id"],
    )


def downgrade() -> None:
    op.drop_table("prison_break_interrogation_turn")
    op.drop_table("prison_break_interrogation")
    op.drop_table("prison_break_patrol_plan")
    op.drop_table("prison_break_lockpick_session")
