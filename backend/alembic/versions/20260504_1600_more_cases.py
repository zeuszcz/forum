"""Add 4 more cases with varied loot tables.

Revision ID: 20260504_1600
Revises: 20260504_1300
Create Date: 2026-05-04

Adds:
- Бронзовый сундук (1 ключ)  — XP-фокус, шаг вверх от стартового
- Серебряный кейс (2 ключа)  — баланс XP + средние перки
- Золотой кейс (5 ключей)    — премиум, высокий шанс на легендарки
- Камень судьбы (3 ключа)    — лотерея с экстремальной дисперсией

Также вводит новый reward_kind='keys' — приз = N доп. ключей (для повторного
открытия). Сервис обновляется в коде отдельно.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260504_1600"
down_revision: str | None = "20260504_1300"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
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
                "id": 2,
                "slug": "bronze",
                "title": "Бронзовый сундук",
                "description": "XP-фокус. Простой кейс на каждый день — шансы выше но призы скромнее.",
                "icon": "package",
                "accent": "flame",
                "key_cost": 1,
                "is_active": True,
            },
            {
                "id": 3,
                "slug": "silver",
                "title": "Серебряный кейс",
                "description": "Баланс между XP и косметикой. Средний шанс на хорошие перки.",
                "icon": "package",
                "accent": "cyan",
                "key_cost": 2,
                "is_active": True,
            },
            {
                "id": 4,
                "slug": "fortune_stone",
                "title": "Камень судьбы",
                "description": "Лотерея — почти всегда мелкое, но 1% шанс на ДЖЕКПОТ. Не для слабонервных.",
                "icon": "sparkles",
                "accent": "ember",
                "key_cost": 3,
                "is_active": True,
            },
            {
                "id": 5,
                "slug": "gold",
                "title": "Золотой кейс",
                "description": "Премиум. Высокий шанс на легендарные перки + большие XP.",
                "icon": "package",
                "accent": "plasma",
                "key_cost": 5,
                "is_active": True,
            },
        ],
    )

    op.bulk_insert(
        items,
        [
            # === Бронзовый сундук (1 ключ) — XP focused ===
            {"case_id": 2, "title": "+15 XP", "rarity": "common", "weight": 450,
             "reward_kind": "xp", "reward_value": 15,
             "reward_payload": None, "icon_color": "#a0a3b8"},
            {"case_id": 2, "title": "+30 XP", "rarity": "common", "weight": 300,
             "reward_kind": "xp", "reward_value": 30,
             "reward_payload": None, "icon_color": "#a0a3b8"},
            {"case_id": 2, "title": "+60 XP", "rarity": "uncommon", "weight": 180,
             "reward_kind": "xp", "reward_value": 60,
             "reward_payload": None, "icon_color": "#22d3ee"},
            {"case_id": 2, "title": "+150 XP", "rarity": "rare", "weight": 60,
             "reward_kind": "xp", "reward_value": 150,
             "reward_payload": None, "icon_color": "#7c5cff"},
            {"case_id": 2, "title": "Эмбед картинок", "rarity": "epic", "weight": 10,
             "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "embed_images", "icon_color": "#ec4899"},

            # === Серебряный кейс (2 ключа) — balance ===
            {"case_id": 3, "title": "+50 XP", "rarity": "common", "weight": 300,
             "reward_kind": "xp", "reward_value": 50,
             "reward_payload": None, "icon_color": "#a0a3b8"},
            {"case_id": 3, "title": "+150 XP", "rarity": "uncommon", "weight": 200,
             "reward_kind": "xp", "reward_value": 150,
             "reward_payload": None, "icon_color": "#22d3ee"},
            {"case_id": 3, "title": "+300 XP", "rarity": "rare", "weight": 120,
             "reward_kind": "xp", "reward_value": 300,
             "reward_payload": None, "icon_color": "#7c5cff"},
            {"case_id": 3, "title": "Голосование в опросах", "rarity": "epic", "weight": 80,
             "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "vote_polls", "icon_color": "#ec4899"},
            {"case_id": 3, "title": "Создание опросов", "rarity": "epic", "weight": 50,
             "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "create_polls", "icon_color": "#ec4899"},
            {"case_id": 3, "title": "Эмбед картинок", "rarity": "epic", "weight": 60,
             "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "embed_images", "icon_color": "#ec4899"},
            {"case_id": 3, "title": "+1 ключ обратно", "rarity": "rare", "weight": 30,
             "reward_kind": "keys", "reward_value": 1,
             "reward_payload": None, "icon_color": "#facc15"},
            {"case_id": 3, "title": "Свечение аватара", "rarity": "legendary", "weight": 10,
             "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "animated_frame", "icon_color": "#facc15"},

            # === Камень судьбы (3 ключа) — high variance lottery ===
            {"case_id": 4, "title": "+10 XP (увы)", "rarity": "common", "weight": 600,
             "reward_kind": "xp", "reward_value": 10,
             "reward_payload": None, "icon_color": "#6b6e85"},
            {"case_id": 4, "title": "+30 XP", "rarity": "common", "weight": 250,
             "reward_kind": "xp", "reward_value": 30,
             "reward_payload": None, "icon_color": "#a0a3b8"},
            {"case_id": 4, "title": "+200 XP", "rarity": "rare", "weight": 80,
             "reward_kind": "xp", "reward_value": 200,
             "reward_payload": None, "icon_color": "#7c5cff"},
            {"case_id": 4, "title": "+500 XP", "rarity": "epic", "weight": 30,
             "reward_kind": "xp", "reward_value": 500,
             "reward_payload": None, "icon_color": "#ec4899"},
            # Jackpot tier — total ~1.5%
            {"case_id": 4, "title": "ДЖЕКПОТ +2000 XP", "rarity": "legendary", "weight": 10,
             "reward_kind": "xp", "reward_value": 2000,
             "reward_payload": None, "icon_color": "#facc15"},
            {"case_id": 4, "title": "ДЖЕКПОТ +5 ключей", "rarity": "legendary", "weight": 5,
             "reward_kind": "keys", "reward_value": 5,
             "reward_payload": None, "icon_color": "#facc15"},

            # === Золотой кейс (5 ключей) — premium ===
            {"case_id": 5, "title": "+200 XP", "rarity": "common", "weight": 250,
             "reward_kind": "xp", "reward_value": 200,
             "reward_payload": None, "icon_color": "#a0a3b8"},
            {"case_id": 5, "title": "+500 XP", "rarity": "uncommon", "weight": 200,
             "reward_kind": "xp", "reward_value": 500,
             "reward_payload": None, "icon_color": "#22d3ee"},
            {"case_id": 5, "title": "+1000 XP", "rarity": "rare", "weight": 150,
             "reward_kind": "xp", "reward_value": 1000,
             "reward_payload": None, "icon_color": "#7c5cff"},
            {"case_id": 5, "title": "Свечение аватара", "rarity": "epic", "weight": 100,
             "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "animated_frame", "icon_color": "#ec4899"},
            {"case_id": 5, "title": "Кастомный титул", "rarity": "epic", "weight": 80,
             "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "custom_title", "icon_color": "#ec4899"},
            {"case_id": 5, "title": "Свечение ника", "rarity": "legendary", "weight": 40,
             "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "glow_nick", "icon_color": "#facc15"},
            {"case_id": 5, "title": "+2 ключа обратно", "rarity": "rare", "weight": 50,
             "reward_kind": "keys", "reward_value": 2,
             "reward_payload": None, "icon_color": "#facc15"},
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM case_items WHERE case_id IN (2, 3, 4, 5)")
    op.execute("DELETE FROM cases WHERE id IN (2, 3, 4, 5)")
