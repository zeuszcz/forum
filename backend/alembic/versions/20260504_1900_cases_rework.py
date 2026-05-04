"""Rework case loot tables.

Revision ID: 20260504_1900
Revises: 20260504_1600
Create Date: 2026-05-04

Changes:
- Removes case_items that drop perks now baseline-for-everyone
  (embed_images, vote_polls, create_polls).
- Cleans those slugs from users.granted_perks (cosmetic only — they were
  no-ops in the current code anyway).
- Adds new reward_kind='title' items (pre-made vanity titles) so cases
  give actually-different rewards instead of reproducing perks the user
  already has by default.
- Bumps XP across the loot tables so opening cases is worth it.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260504_1900"
down_revision: str | None = "20260504_1600"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1) Drop drops that targeted now-baseline perks
    op.execute(
        """
        DELETE FROM case_items
        WHERE reward_kind = 'perk'
          AND reward_payload IN ('embed_images', 'vote_polls', 'create_polls')
        """
    )

    # 2) Clean those slugs out of granted_perks arrays (Postgres array_remove)
    op.execute(
        """
        UPDATE users
        SET granted_perks = COALESCE(
          array_remove(
            array_remove(
              array_remove(granted_perks, 'embed_images'),
              'vote_polls'
            ),
            'create_polls'
          ),
          ARRAY[]::varchar(32)[]
        )
        WHERE granted_perks IS NOT NULL
        """
    )

    # 3) Insert new title rewards + extra XP variants per case
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
        items,
        [
            # Стартовый кейс (id=1) — replace the 3 dropped perk slots with titles + XP
            {"case_id": 1, "title": "Титул «🍀 Везунчик»", "rarity": "epic",
             "weight": 30, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "🍀 Везунчик", "icon_color": "#22c55e"},
            {"case_id": 1, "title": "Титул «💎 Лутер»", "rarity": "epic",
             "weight": 30, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "💎 Лутер", "icon_color": "#22d3ee"},
            {"case_id": 1, "title": "+250 XP", "rarity": "rare",
             "weight": 80, "reward_kind": "xp", "reward_value": 250,
             "reward_payload": None, "icon_color": "#7c5cff"},

            # Бронзовый сундук (id=2) — add a title roll
            {"case_id": 2, "title": "Титул «🎰 Игрок RNG»", "rarity": "epic",
             "weight": 25, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "🎰 Игрок RNG", "icon_color": "#ec4899"},

            # Серебряный кейс (id=3) — bigger titles + XP boost
            {"case_id": 3, "title": "Титул «🦁 Зверь»", "rarity": "epic",
             "weight": 50, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "🦁 Зверь", "icon_color": "#facc15"},
            {"case_id": 3, "title": "Титул «🌟 Звезда»", "rarity": "epic",
             "weight": 50, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "🌟 Звезда", "icon_color": "#facc15"},
            {"case_id": 3, "title": "+750 XP", "rarity": "rare",
             "weight": 60, "reward_kind": "xp", "reward_value": 750,
             "reward_payload": None, "icon_color": "#7c5cff"},

            # Камень судьбы (id=4) — bonus title jackpot
            {"case_id": 4, "title": "Титул «💀 Скелет»", "rarity": "rare",
             "weight": 20, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "💀 Скелет", "icon_color": "#a0a3b8"},
            {"case_id": 4, "title": "ДЖЕКПОТ Титул «👑 Король кейсов»", "rarity": "legendary",
             "weight": 8, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "👑 Король кейсов", "icon_color": "#facc15"},

            # Золотой кейс (id=5) — premium titles + huge XP
            {"case_id": 5, "title": "Титул «🚀 Космонавт»", "rarity": "epic",
             "weight": 80, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "🚀 Космонавт", "icon_color": "#7c5cff"},
            {"case_id": 5, "title": "Титул «💎 Алмаз»", "rarity": "epic",
             "weight": 80, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "💎 Алмаз", "icon_color": "#22d3ee"},
            {"case_id": 5, "title": "Титул «🏆 Чемпион»", "rarity": "legendary",
             "weight": 30, "reward_kind": "title", "reward_value": 0,
             "reward_payload": "🏆 Чемпион", "icon_color": "#facc15"},
            {"case_id": 5, "title": "+5000 XP", "rarity": "legendary",
             "weight": 20, "reward_kind": "xp", "reward_value": 5000,
             "reward_payload": None, "icon_color": "#facc15"},
        ],
    )


def downgrade() -> None:
    # Drop title-based items
    op.execute("DELETE FROM case_items WHERE reward_kind = 'title'")
    # Drop the bumped XP additions (heuristic: high-value rare/legendary)
    op.execute(
        "DELETE FROM case_items WHERE reward_kind = 'xp' AND reward_value IN (250, 750, 5000)"
    )
    # Re-insert removed perks (best-effort, original odds)
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
        items,
        [
            {"case_id": 1, "title": "Эмбед картинок (perk)", "rarity": "epic",
             "weight": 30, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "embed_images", "icon_color": "#ec4899"},
            {"case_id": 1, "title": "Голосование в опросах", "rarity": "epic",
             "weight": 30, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "vote_polls", "icon_color": "#ec4899"},
            {"case_id": 2, "title": "Эмбед картинок", "rarity": "epic",
             "weight": 10, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "embed_images", "icon_color": "#ec4899"},
            {"case_id": 3, "title": "Голосование в опросах", "rarity": "epic",
             "weight": 80, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "vote_polls", "icon_color": "#ec4899"},
            {"case_id": 3, "title": "Создание опросов", "rarity": "epic",
             "weight": 50, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "create_polls", "icon_color": "#ec4899"},
            {"case_id": 3, "title": "Эмбед картинок", "rarity": "epic",
             "weight": 60, "reward_kind": "perk", "reward_value": 0,
             "reward_payload": "embed_images", "icon_color": "#ec4899"},
        ],
    )
