"""Phase 3 — Daily quests.

Revision ID: 20260504_1100
Revises: 20260504_0900
Create Date: 2026-05-04

Adds:
- daily_quests        — catalog of quest templates
- user_daily_quests   — per-user per-day assignments + progress
- users.bonus_xp      — accumulated XP from completed quests/cases

Seeds 6 starter quest templates (post-, thread-, reaction-based).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260504_1100"
down_revision: str | None = "20260504_0900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_quests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(64), unique=True, nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("requirement_kind", sa.String(32), nullable=False),
        sa.Column("requirement_value", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("reward_xp", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "user_daily_quests",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("quest_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
            name="fk_user_daily_quests_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["quest_id"], ["daily_quests.id"], ondelete="CASCADE",
            name="fk_user_daily_quests_quest_id_daily_quests",
        ),
    )
    op.create_index("ix_user_daily_quests_user_id", "user_daily_quests", ["user_id"])
    op.create_index("ix_user_daily_quests_quest_id", "user_daily_quests", ["quest_id"])
    op.create_index("ix_user_daily_quests_day", "user_daily_quests", ["day"])
    op.create_index(
        "ix_user_daily_quests_user_day",
        "user_daily_quests",
        ["user_id", "day"],
    )

    # bonus_xp accumulates from completed quests + future case rewards
    op.add_column(
        "users",
        sa.Column(
            "bonus_xp",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    # Seed starter quests
    quests = sa.table(
        "daily_quests",
        sa.column("slug", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("requirement_kind", sa.String),
        sa.column("requirement_value", sa.Integer),
        sa.column("reward_xp", sa.Integer),
        sa.column("weight", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        quests,
        [
            {
                "slug": "daily_post_3",
                "title": "Активный болтун",
                "description": "Напиши 3 поста за день.",
                "requirement_kind": "post_count",
                "requirement_value": 3,
                "reward_xp": 15,
                "weight": 100,
                "is_active": True,
            },
            {
                "slug": "daily_post_10",
                "title": "Графоман",
                "description": "Напиши 10 постов за день.",
                "requirement_kind": "post_count",
                "requirement_value": 10,
                "reward_xp": 40,
                "weight": 60,
                "is_active": True,
            },
            {
                "slug": "daily_thread_1",
                "title": "Новая тема",
                "description": "Создай 1 новую тему сегодня.",
                "requirement_kind": "thread_count",
                "requirement_value": 1,
                "reward_xp": 25,
                "weight": 90,
                "is_active": True,
            },
            {
                "slug": "daily_react_5",
                "title": "Эмодзи-марафон",
                "description": "Поставь 5 реакций сегодня.",
                "requirement_kind": "react_given",
                "requirement_value": 5,
                "reward_xp": 10,
                "weight": 100,
                "is_active": True,
            },
            {
                "slug": "daily_react_received_3",
                "title": "Понравилось",
                "description": "Получи 3 реакции на свои посты.",
                "requirement_kind": "react_received",
                "requirement_value": 3,
                "reward_xp": 20,
                "weight": 80,
                "is_active": True,
            },
            {
                "slug": "daily_react_received_10",
                "title": "Народный любимец",
                "description": "Получи 10 реакций на свои посты.",
                "requirement_kind": "react_received",
                "requirement_value": 10,
                "reward_xp": 50,
                "weight": 40,
                "is_active": True,
            },
        ],
    )


def downgrade() -> None:
    op.drop_column("users", "bonus_xp")
    op.drop_index("ix_user_daily_quests_user_day", table_name="user_daily_quests")
    op.drop_index("ix_user_daily_quests_day", table_name="user_daily_quests")
    op.drop_index("ix_user_daily_quests_quest_id", table_name="user_daily_quests")
    op.drop_index("ix_user_daily_quests_user_id", table_name="user_daily_quests")
    op.drop_table("user_daily_quests")
    op.drop_table("daily_quests")
