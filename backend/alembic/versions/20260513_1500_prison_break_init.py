"""prison_break — full schema for the 21-day faction event.

Revision ID: 20260513_1500
Revises: 20260511_2200
Create Date: 2026-05-13

13 tables. The event design is a multi-faction RP arc with daily AP-driven
actions, intel propagation, alliance pacts, mini-games (lock pick, patrol,
crafting tap, arena fighter, interrogation), and a cinematic Final Night.
See `/event/prison-break/info` for the player-facing rule book.

Indexes are optimised for the hottest queries:
  • prison_break_player.event_id+user_id (lookup self)
  • prison_break_action.actor_id+created_at DESC (audit feed)
  • prison_break_intel_view.viewer_id+received_at DESC (feed)
  • prison_break_market_order.event_id+resource+side+price (book scan)
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260513_1500"
down_revision: str | None = "20260511_2200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1) EVENT — single row per season. Only one is active at a time.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_event",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("season", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False, server_default="Тюремный Бунт"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default="draft",  # draft|signup|active|finished|cancelled
        ),
        sa.Column("current_phase", sa.String(length=20), nullable=False, server_default="setup"),
        sa.Column("current_day", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("signup_opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("config", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("season", name="uq_prison_break_event_season"),
    )
    op.create_index(
        "ix_prison_break_event_status",
        "prison_break_event", ["status"],
    )

    # ------------------------------------------------------------------
    # 2) PLAYER — per-user registration into an event.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_player",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("nickname", sa.String(length=32), nullable=False),
        sa.Column("tattoo", sa.String(length=8), nullable=False),
        sa.Column("article", sa.String(length=80), nullable=False, server_default=""),
        sa.Column(
            "role", sa.String(length=20), nullable=True,
            comment="prisoner|guard|authority|spy|boss — null until role assignment",
        ),
        sa.Column("faction", sa.String(length=20), nullable=True),
        sa.Column("block", sa.String(length=1), nullable=True),
        sa.Column("cell_id", sa.Integer(), nullable=True),
        sa.Column("ap_current", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("ap_max", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("money", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("resource_scrap", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("resource_paper", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default="active",  # active|carcer|fled|caught|disconnected
        ),
        sa.Column(
            "welcome_seen_at", sa.DateTime(timezone=True), nullable=True,
            comment="when the welcome cinematic was first displayed",
        ),
        sa.Column("eliminated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["prison_break_event.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
        ),
        sa.UniqueConstraint("event_id", "user_id", name="uq_prison_break_player_event_user"),
    )
    op.create_index(
        "ix_prison_break_player_event_role",
        "prison_break_player", ["event_id", "role"],
    )
    op.create_index(
        "ix_prison_break_player_cell",
        "prison_break_player", ["cell_id"],
    )

    # ------------------------------------------------------------------
    # 3) CELL — group of 4 prisoners + their tunnel state.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_cell",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("block", sa.String(length=1), nullable=False),
        sa.Column("number", sa.SmallInteger(), nullable=False),
        sa.Column("tunnel_progress", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("tunnel_discovered", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("camera_disabled_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["prison_break_event.id"], ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "event_id", "block", "number", name="uq_prison_break_cell_event_block_number",
        ),
    )
    # Now that prison_break_cell exists, wire the FK from player.cell_id.
    op.create_foreign_key(
        "fk_prison_break_player_cell_id",
        source_table="prison_break_player",
        referent_table="prison_break_cell",
        local_cols=["cell_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )

    # ------------------------------------------------------------------
    # 4) ACTION — every AP-spend event for audit + replay + analytics.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_action",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("ap_spent", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("success", sa.Boolean(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column(
            "idempotency_key", sa.String(length=64), nullable=True,
            comment="client-provided uuid to dedupe double-submissions",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["prison_break_player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["prison_break_player.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_prison_break_action_actor_time",
        "prison_break_action", ["actor_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_prison_break_action_idempotency",
        "prison_break_action", ["actor_id", "idempotency_key"],
        unique=True, postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    # ------------------------------------------------------------------
    # 5) INTEL — informational atoms, can be true or fabricated.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_intel",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_truth", sa.Boolean(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("about_user_id", sa.Integer(), nullable=True),
        sa.Column("about_cell_id", sa.Integer(), nullable=True),
        sa.Column("source_role", sa.String(length=20), nullable=True),
        sa.Column("source_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "fabricated", sa.Boolean(), nullable=False, server_default=sa.false(),
            comment="True if bot-generated or planted by spy/boss",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
    )

    # ------------------------------------------------------------------
    # 6) INTEL_VIEW — who has seen which intel piece.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_intel_view",
        sa.Column("intel_id", sa.BigInteger(), nullable=False),
        sa.Column("viewer_id", sa.Integer(), nullable=False),
        sa.Column(
            "received_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("forwarded_from_id", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("intel_id", "viewer_id"),
        sa.ForeignKeyConstraint(["intel_id"], ["prison_break_intel.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["viewer_id"], ["prison_break_player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["forwarded_from_id"], ["prison_break_player.id"], ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_prison_break_intel_view_viewer",
        "prison_break_intel_view", ["viewer_id", sa.text("received_at DESC")],
    )

    # ------------------------------------------------------------------
    # 7) INVENTORY — items each player holds.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_inventory",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("item_type", sa.String(length=30), nullable=False),
        sa.Column(
            "quality", sa.String(length=20), nullable=False, server_default="good",
        ),  # master|good|crooked
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column(
            "acquired_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["prison_break_player.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_prison_break_inventory_owner",
        "prison_break_inventory", ["owner_id"],
    )

    # ------------------------------------------------------------------
    # 8) TRUST — pairwise trust between players, 0-100.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_trust",
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("user_a", sa.Integer(), nullable=False),
        sa.Column("user_b", sa.Integer(), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=False, server_default="50"),
        sa.Column(
            "last_change_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("event_id", "user_a", "user_b"),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_a"], ["prison_break_player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_b"], ["prison_break_player.id"], ondelete="CASCADE"),
        sa.CheckConstraint("user_a < user_b", name="ck_prison_break_trust_order"),
        sa.CheckConstraint("score BETWEEN 0 AND 100", name="ck_prison_break_trust_bounds"),
    )

    # ------------------------------------------------------------------
    # 9) ALLIANCE — formal multi-party pacts.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_alliance",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("parties", sa.ARRAY(sa.Integer()), nullable=False),
        sa.Column("pact_type", sa.String(length=30), nullable=False),
        sa.Column("terms", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="proposed",
        ),  # proposed|active|expired|broken|cancelled
        sa.Column(
            "proposed_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("broken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("broken_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["broken_by_id"], ["prison_break_player.id"], ondelete="SET NULL"),
    )

    # ------------------------------------------------------------------
    # 10) ARENA_MATCH — 2D fighter records.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_arena_match",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("player_a_id", sa.Integer(), nullable=False),
        sa.Column("player_b_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="pending",
        ),  # pending|active|finished|cancelled|forfeit
        sa.Column("winner_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "replay", sa.JSON(), nullable=True,
            comment="compressed per-tick state deltas for replay scrubber",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_a_id"], ["prison_break_player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_b_id"], ["prison_break_player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["winner_id"], ["prison_break_player.id"], ondelete="SET NULL"),
    )

    # ------------------------------------------------------------------
    # 11) ARENA_BET — spectator bets.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_arena_bet",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.BigInteger(), nullable=False),
        sa.Column("bettor_id", sa.Integer(), nullable=False),
        sa.Column("on_player_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("odds", sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column(
            "placed_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payout", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["match_id"], ["prison_break_arena_match.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bettor_id"], ["prison_break_player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["on_player_id"], ["prison_break_player.id"], ondelete="CASCADE"),
    )

    # ------------------------------------------------------------------
    # 12) MARKET_ORDER — black-market order book.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_market_order",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("side", sa.String(length=4), nullable=False),  # bid|ask
        sa.Column("resource", sa.String(length=20), nullable=False),
        sa.Column("qty_total", sa.Integer(), nullable=False),
        sa.Column("qty_remaining", sa.Integer(), nullable=False),
        sa.Column("price_per_unit", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="open",
        ),  # open|filled|cancelled|partial
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["prison_break_player.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_prison_break_market_book",
        "prison_break_market_order",
        ["event_id", "resource", "side", "price_per_unit"],
    )

    # ------------------------------------------------------------------
    # 13) REVEAL — scheduled & past reveal log.
    # ------------------------------------------------------------------
    op.create_table(
        "prison_break_reveal",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.SmallInteger(), nullable=False),
        sa.Column("reveal_type", sa.String(length=30), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revealed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["prison_break_event.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("prison_break_reveal")
    op.drop_table("prison_break_market_order")
    op.drop_table("prison_break_arena_bet")
    op.drop_table("prison_break_arena_match")
    op.drop_table("prison_break_alliance")
    op.drop_table("prison_break_trust")
    op.drop_table("prison_break_inventory")
    op.drop_table("prison_break_intel_view")
    op.drop_table("prison_break_intel")
    op.drop_table("prison_break_action")
    op.drop_constraint(
        "fk_prison_break_player_cell_id",
        "prison_break_player",
        type_="foreignkey",
    )
    op.drop_table("prison_break_cell")
    op.drop_table("prison_break_player")
    op.drop_table("prison_break_event")
