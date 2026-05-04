"""Time-bounded perks + server privilege cases + profile banner.

Revision ID: 20260504_2200
Revises: 20260504_1900
Create Date: 2026-05-04

Schema changes:
- New `user_perk_grants` table — per-grant row with expires_at (NULL=permanent)
- `case_items.duration_days` — duration for perk-kind drops (NULL=permanent)
- `users.profile_banner_url` — uploaded banner image for profile

Loot rework:
- Drops all reward_kind='title' items (user wants to set titles themselves)
- Adds new server privilege perk slugs: server_vip, server_admin,
  server_reserved (auto-delivery to game server is a follow-up)
- Adds new cosmetic perk: profile_banner (unlocks banner image upload)
- Two new cases:
  * Сервер VIP (3 ключа) — durations 7d / 30d / 90d / навсегда
  * Сервер Премиум (8 ключей) — admin / reserved slot / VIP forever
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260504_2200"
down_revision: str | None = "20260504_1900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1) New table for time-bounded grants
    op.create_table(
        "user_perk_grants",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("perk_slug", sa.String(64), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
            name="fk_user_perk_grants_user_id_users",
        ),
    )
    op.create_index("ix_user_perk_grants_user_id", "user_perk_grants", ["user_id"])
    op.create_index("ix_user_perk_grants_perk_slug", "user_perk_grants", ["perk_slug"])
    op.create_index("ix_user_perk_grants_expires_at", "user_perk_grants", ["expires_at"])

    # 2) Duration on case items
    op.add_column(
        "case_items",
        sa.Column("duration_days", sa.Integer(), nullable=True),
    )

    # 3) Profile banner URL
    op.add_column(
        "users",
        sa.Column("profile_banner_url", sa.String(512), nullable=True),
    )

    # 4) Drop title rewards (user requested removal)
    op.execute("DELETE FROM case_items WHERE reward_kind = 'title'")

    # 5) Insert two new cases for server privileges
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
    op.bulk_insert(
        cases,
        [
            {
                "id": 6,
                "slug": "server_vip",
                "title": "Сервер VIP",
                "description": "Привилегии на CS-сервере: VIP, резерв-слот. Длительность от 7 дней до навсегда.",
                "icon": "shield",
                "accent": "cyan",
                "key_cost": 3,
                "is_active": True,
            },
            {
                "id": 7,
                "slug": "server_premium",
                "title": "Сервер Премиум",
                "description": "Топовые привилегии: админ, резерв, VIP навсегда. Самый дорогой кейс.",
                "icon": "shield",
                "accent": "ember",
                "key_cost": 8,
                "is_active": True,
            },
        ],
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
        sa.column("duration_days", sa.Integer),
    )

    op.bulk_insert(
        items,
        [
            # === Сервер VIP (case_id=6, key_cost=3) ===
            # Mostly short VIPs, some longer
            {"case_id": 6, "title": "VIP на 7 дней", "rarity": "common",
             "weight": 400, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#22d3ee",
             "duration_days": 7},
            {"case_id": 6, "title": "VIP на 30 дней", "rarity": "uncommon",
             "weight": 250, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#22d3ee",
             "duration_days": 30},
            {"case_id": 6, "title": "VIP на 90 дней", "rarity": "rare",
             "weight": 80, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#7c5cff",
             "duration_days": 90},
            {"case_id": 6, "title": "Резерв-слот на 7 дней", "rarity": "common",
             "weight": 200, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_reserved", "icon_color": "#22d3ee",
             "duration_days": 7},
            {"case_id": 6, "title": "Резерв-слот на 30 дней", "rarity": "uncommon",
             "weight": 100, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_reserved", "icon_color": "#22d3ee",
             "duration_days": 30},
            # Consolation
            {"case_id": 6, "title": "+200 XP (увы)", "rarity": "common",
             "weight": 150, "reward_kind": "xp", "reward_value": 200,
             "reward_payload": None, "icon_color": "#a0a3b8",
             "duration_days": None},
            # Big drop
            {"case_id": 6, "title": "VIP НАВСЕГДА", "rarity": "legendary",
             "weight": 8, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#facc15",
             "duration_days": None},

            # === Сервер Премиум (case_id=7, key_cost=8) ===
            # Always big rewards
            {"case_id": 7, "title": "VIP на 30 дней", "rarity": "common",
             "weight": 200, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#22d3ee",
             "duration_days": 30},
            {"case_id": 7, "title": "VIP на 90 дней", "rarity": "uncommon",
             "weight": 250, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#22d3ee",
             "duration_days": 90},
            {"case_id": 7, "title": "Резерв-слот на 90 дней", "rarity": "rare",
             "weight": 150, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_reserved", "icon_color": "#7c5cff",
             "duration_days": 90},
            {"case_id": 7, "title": "Админ на 7 дней", "rarity": "rare",
             "weight": 120, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_admin", "icon_color": "#7c5cff",
             "duration_days": 7},
            {"case_id": 7, "title": "Админ на 30 дней", "rarity": "epic",
             "weight": 80, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_admin", "icon_color": "#ec4899",
             "duration_days": 30},
            {"case_id": 7, "title": "Админ на 90 дней", "rarity": "epic",
             "weight": 40, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_admin", "icon_color": "#ec4899",
             "duration_days": 90},
            # Cosmetic — banner
            {"case_id": 7, "title": "Баннер профиля", "rarity": "epic",
             "weight": 80, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "profile_banner", "icon_color": "#ec4899",
             "duration_days": None},
            # Jackpots
            {"case_id": 7, "title": "VIP НАВСЕГДА", "rarity": "legendary",
             "weight": 30, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#facc15",
             "duration_days": None},
            {"case_id": 7, "title": "АДМИН НАВСЕГДА", "rarity": "legendary",
             "weight": 5, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_admin", "icon_color": "#facc15",
             "duration_days": None},

            # === Sprinkle into existing cases for variety ===
            # Starter (id=1) — replace dropped titles with VIP/banner
            {"case_id": 1, "title": "VIP на 7 дней", "rarity": "rare",
             "weight": 40, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#22d3ee",
             "duration_days": 7},
            {"case_id": 1, "title": "Резерв-слот на 7 дней", "rarity": "rare",
             "weight": 40, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_reserved", "icon_color": "#22d3ee",
             "duration_days": 7},

            # Bronze (id=2)
            {"case_id": 2, "title": "VIP на 7 дней", "rarity": "rare",
             "weight": 30, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#22d3ee",
             "duration_days": 7},

            # Silver (id=3)
            {"case_id": 3, "title": "VIP на 30 дней", "rarity": "rare",
             "weight": 50, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#22d3ee",
             "duration_days": 30},
            {"case_id": 3, "title": "Баннер профиля", "rarity": "epic",
             "weight": 30, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "profile_banner", "icon_color": "#ec4899",
             "duration_days": None},

            # Gold (id=5)
            {"case_id": 5, "title": "VIP НАВСЕГДА", "rarity": "legendary",
             "weight": 20, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_vip", "icon_color": "#facc15",
             "duration_days": None},
            {"case_id": 5, "title": "Админ на 30 дней", "rarity": "epic",
             "weight": 50, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "server_admin", "icon_color": "#ec4899",
             "duration_days": 30},
            {"case_id": 5, "title": "Баннер профиля", "rarity": "epic",
             "weight": 60, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "profile_banner", "icon_color": "#ec4899",
             "duration_days": None},
        ],
    )


def downgrade() -> None:
    # Remove case_items added in this migration (heuristic — by payload)
    op.execute(
        """
        DELETE FROM case_items
        WHERE reward_payload IN ('server_vip', 'server_admin', 'server_reserved', 'profile_banner')
        """
    )
    op.execute("DELETE FROM cases WHERE id IN (6, 7)")
    op.drop_column("users", "profile_banner_url")
    op.drop_column("case_items", "duration_days")
    op.drop_index("ix_user_perk_grants_expires_at", table_name="user_perk_grants")
    op.drop_index("ix_user_perk_grants_perk_slug", table_name="user_perk_grants")
    op.drop_index("ix_user_perk_grants_user_id", table_name="user_perk_grants")
    op.drop_table("user_perk_grants")
