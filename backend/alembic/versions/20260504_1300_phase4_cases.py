"""Phase 4 — Cases / lootbox.

Revision ID: 20260504_1300
Revises: 20260504_1100
Create Date: 2026-05-04

Adds:
- cases            — case definitions
- case_items       — loot-table entries per case
- user_keys        — audit row per granted/consumed key
- case_openings    — audit row per opening (which item dropped)
- users.case_keys  — cached counter of unspent keys
- 1 default case 'starter' with 5 items of varying rarity
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260504_1300"
down_revision: str | None = "20260504_1100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(64), unique=True, nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("icon", sa.String(32), nullable=False, server_default="package"),
        sa.Column("accent", sa.String(16), nullable=False, server_default="plasma"),
        sa.Column("key_cost", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "case_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("case_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("rarity", sa.String(16), nullable=False, server_default="common"),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("reward_kind", sa.String(16), nullable=False, server_default="xp"),
        sa.Column("reward_value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reward_payload", sa.String(64), nullable=True),
        sa.Column("icon_color", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["case_id"], ["cases.id"], ondelete="CASCADE",
            name="fk_case_items_case_id_cases",
        ),
    )
    op.create_index("ix_case_items_case_id", "case_items", ["case_id"])

    op.create_table(
        "user_keys",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("granted_for", sa.String(64), nullable=False, server_default="quest_completed"),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
            name="fk_user_keys_user_id_users",
        ),
    )
    op.create_index("ix_user_keys_user_id", "user_keys", ["user_id"])

    op.create_table(
        "case_openings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.Integer(), nullable=False),
        sa.Column("case_item_id", sa.Integer(), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
            name="fk_case_openings_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["case_id"], ["cases.id"], ondelete="CASCADE",
            name="fk_case_openings_case_id_cases",
        ),
        sa.ForeignKeyConstraint(
            ["case_item_id"], ["case_items.id"], ondelete="CASCADE",
            name="fk_case_openings_case_item_id_case_items",
        ),
    )
    op.create_index("ix_case_openings_user_id", "case_openings", ["user_id"])
    op.create_index("ix_case_openings_case_id", "case_openings", ["case_id"])

    op.add_column(
        "users",
        sa.Column(
            "case_keys",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    # Seed a starter case
    cases = sa.table(
        "cases",
        sa.column("id", sa.Integer),
        sa.column("slug", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("icon", sa.String),
        sa.column("accent", sa.String),
        sa.column("key_cost", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    items = sa.table(
        "case_items",
        sa.column("case_id", sa.Integer),
        sa.column("title", sa.String),
        sa.column("rarity", sa.String),
        sa.column("weight", sa.Integer),
        sa.column("reward_kind", sa.String),
        sa.column("reward_value", sa.Integer),
        sa.column("reward_payload", sa.String),
        sa.column("icon_color", sa.String),
    )
    op.bulk_insert(
        cases,
        [
            {
                "id": 1,
                "slug": "starter",
                "title": "Стартовый кейс",
                "description": "Первый кейс — простые награды для новичков.",
                "icon": "package",
                "accent": "plasma",
                "key_cost": 1,
                "is_active": True,
            },
        ],
    )
    op.bulk_insert(
        items,
        [
            # Common: small XP
            {
                "case_id": 1, "title": "+10 XP", "rarity": "common",
                "weight": 500, "reward_kind": "xp", "reward_value": 10,
                "reward_payload": None, "icon_color": "#a0a3b8",
            },
            {
                "case_id": 1, "title": "+25 XP", "rarity": "uncommon",
                "weight": 250, "reward_kind": "xp", "reward_value": 25,
                "reward_payload": None, "icon_color": "#22d3ee",
            },
            # Rare: bigger XP
            {
                "case_id": 1, "title": "+100 XP", "rarity": "rare",
                "weight": 100, "reward_kind": "xp", "reward_value": 100,
                "reward_payload": None, "icon_color": "#7c5cff",
            },
            # Epic: cosmetic perks
            {
                "case_id": 1, "title": "Эмбед картинок (perk)", "rarity": "epic",
                "weight": 30, "reward_kind": "perk", "reward_value": 0,
                "reward_payload": "embed_images", "icon_color": "#ec4899",
            },
            {
                "case_id": 1, "title": "Голосование в опросах", "rarity": "epic",
                "weight": 30, "reward_kind": "perk", "reward_value": 0,
                "reward_payload": "vote_polls", "icon_color": "#ec4899",
            },
            # Legendary: glow nick
            {
                "case_id": 1, "title": "Свечение ника (perk)", "rarity": "legendary",
                "weight": 5, "reward_kind": "perk", "reward_value": 0,
                "reward_payload": "glow_nick", "icon_color": "#facc15",
            },
        ],
    )


def downgrade() -> None:
    op.drop_column("users", "case_keys")
    op.drop_index("ix_case_openings_case_id", table_name="case_openings")
    op.drop_index("ix_case_openings_user_id", table_name="case_openings")
    op.drop_table("case_openings")
    op.drop_index("ix_user_keys_user_id", table_name="user_keys")
    op.drop_table("user_keys")
    op.drop_index("ix_case_items_case_id", table_name="case_items")
    op.drop_table("case_items")
    op.drop_table("cases")
