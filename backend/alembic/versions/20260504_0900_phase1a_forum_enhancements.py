"""Phase 1A — Forum enhancements bundle.

Revision ID: 20260504_0900
Revises: 20260503_2200
Create Date: 2026-05-04

Adds:
- sections.parent_id    — two-level hierarchy support
- posts.edited_by_id    — track who last edited a post (staff vs author)
- roles.affiliation_tag — suffix shown after role title (e.g. "Admin ► JB")
- users.thanks_received — separate counter for `thanks` reactions

Seeds three new sections: Releases / Promo / Demos.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260504_0900"
down_revision: str | None = "20260503_2200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Section hierarchy
    op.add_column(
        "sections",
        sa.Column("parent_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_sections_parent_id_sections",
        "sections",
        "sections",
        ["parent_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_sections_parent_id", "sections", ["parent_id"])

    # Edit attribution
    op.add_column(
        "posts",
        sa.Column("edited_by_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_posts_edited_by_id_users",
        "posts",
        "users",
        ["edited_by_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Role affiliation tag
    op.add_column(
        "roles",
        sa.Column("affiliation_tag", sa.String(32), nullable=True),
    )

    # Thanks counter (cached)
    op.add_column(
        "users",
        sa.Column(
            "thanks_received",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    # Backfill thanks_received from existing thanks reactions
    op.execute(
        """
        UPDATE users u SET thanks_received = COALESCE(t.cnt, 0) FROM (
            SELECT p.author_id AS uid, COUNT(*) AS cnt
            FROM reactions r
            JOIN posts p ON p.id = r.post_id
            WHERE r.kind = 'thanks'
            GROUP BY p.author_id
        ) t
        WHERE u.id = t.uid
        """
    )

    # ---- Seed new content sections ----
    sections = sa.table(
        "sections",
        sa.column("slug", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("icon", sa.String),
        sa.column("accent", sa.String),
        sa.column("display_order", sa.Integer),
        sa.column("is_locked", sa.Boolean),
    )
    op.bulk_insert(
        sections,
        [
            {
                "slug": "releases",
                "title": "Релизы и Обновления",
                "description": "Анонсы новых фич и патчей. Только staff может создавать темы.",
                "icon": "sparkles",
                "accent": "plasma",
                "display_order": 5,
                "is_locked": False,
            },
            {
                "slug": "promo",
                "title": "Промо-акции и Бесплатный VIP",
                "description": "Акции, розыгрыши, раздачи привилегий.",
                "icon": "megaphone",
                "accent": "flame",
                "display_order": 8,
                "is_locked": False,
            },
            {
                "slug": "demos",
                "title": "Демки и Подозрительные",
                "description": "Загрузка демок матчей и обсуждение подозрительных игроков.",
                "icon": "shield",
                "accent": "cyan",
                "display_order": 12,
                "is_locked": False,
            },
        ],
    )


def downgrade() -> None:
    # Drop seeded sections (best-effort; if threads exist FK will block)
    op.execute("DELETE FROM sections WHERE slug IN ('releases', 'promo', 'demos')")

    op.drop_column("users", "thanks_received")
    op.drop_column("roles", "affiliation_tag")
    op.drop_constraint("fk_posts_edited_by_id_users", "posts", type_="foreignkey")
    op.drop_column("posts", "edited_by_id")
    op.drop_index("ix_sections_parent_id", table_name="sections")
    op.drop_constraint("fk_sections_parent_id_sections", "sections", type_="foreignkey")
    op.drop_column("sections", "parent_id")
