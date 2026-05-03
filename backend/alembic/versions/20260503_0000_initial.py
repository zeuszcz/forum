"""initial schema — users, roles, sections, threads, posts, reactions, shoutbox

Revision ID: 20260503_0000
Revises:
Create Date: 2026-05-03

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260503_0000"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ---- users ----
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("nickname", sa.String(64), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("steam_id", sa.String(32), nullable=True),
        sa.Column("avatar_url", sa.String(512), nullable=True),
        sa.Column("title", sa.String(80), nullable=True),
        sa.Column("bio", sa.String(1024), nullable=True),
        sa.Column("signature", sa.String(1024), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_nickname", "users", ["nickname"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_steam_id", "users", ["steam_id"], unique=True)

    # ---- roles ----
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(32), nullable=False),
        sa.Column("title", sa.String(64), nullable=False),
        sa.Column("color", sa.String(16), nullable=False, server_default="#7c5cff"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_staff", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_roles_slug", "roles", ["slug"], unique=True)

    op.create_table(
        "user_roles",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_user_roles_user_id_users"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE", name="fk_user_roles_role_id_roles"),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
    )
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"])
    op.create_index("ix_user_roles_role_id", "user_roles", ["role_id"])

    # ---- sections ----
    op.create_table(
        "sections",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("icon", sa.String(32), nullable=False, server_default="message-square"),
        sa.Column("accent", sa.String(16), nullable=False, server_default="plasma"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requires_role_slug", sa.String(32), nullable=True),
        sa.Column("thread_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("post_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_thread_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sections_slug", "sections", ["slug"], unique=True)

    # ---- threads ----
    op.create_table(
        "threads",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.BigInteger(), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(220), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reply_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_post_id", sa.BigInteger(), nullable=True),
        sa.Column("last_post_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_post_author_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["section_id"], ["sections.id"], ondelete="CASCADE", name="fk_threads_section_id_sections"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL", name="fk_threads_author_id_users"),
    )
    op.create_index("ix_threads_section_id", "threads", ["section_id"])
    op.create_index("ix_threads_author_id", "threads", ["author_id"])
    op.create_index("ix_threads_slug", "threads", ["slug"])
    op.create_index("ix_threads_is_pinned", "threads", ["is_pinned"])
    op.create_index("ix_threads_is_deleted", "threads", ["is_deleted"])
    op.create_index("ix_threads_last_post_at", "threads", ["last_post_at"])

    # ---- posts ----
    op.create_table(
        "posts",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("thread_id", sa.BigInteger(), nullable=False),
        sa.Column("author_id", sa.BigInteger(), nullable=True),
        sa.Column("parent_post_id", sa.BigInteger(), nullable=True),
        sa.Column("body", sa.String(20000), nullable=False),
        sa.Column("is_first", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE", name="fk_posts_thread_id_threads"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL", name="fk_posts_author_id_users"),
        sa.ForeignKeyConstraint(["parent_post_id"], ["posts.id"], ondelete="SET NULL", name="fk_posts_parent_post_id_posts"),
    )
    op.create_index("ix_posts_thread_id", "posts", ["thread_id"])
    op.create_index("ix_posts_author_id", "posts", ["author_id"])
    op.create_index("ix_posts_is_deleted", "posts", ["is_deleted"])

    # ---- reactions ----
    op.create_table(
        "reactions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("post_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False, server_default="like"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE", name="fk_reactions_post_id_posts"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_reactions_user_id_users"),
        sa.UniqueConstraint("post_id", "user_id", "kind", name="uq_reactions_post_user_kind"),
    )
    op.create_index("ix_reactions_post_id", "reactions", ["post_id"])
    op.create_index("ix_reactions_user_id", "reactions", ["user_id"])

    # ---- shoutbox ----
    op.create_table(
        "shoutbox_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("author_id", sa.BigInteger(), nullable=True),
        sa.Column("body", sa.String(280), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL", name="fk_shoutbox_messages_author_id_users"),
    )
    op.create_index("ix_shoutbox_messages_author_id", "shoutbox_messages", ["author_id"])
    op.create_index("ix_shoutbox_messages_is_deleted", "shoutbox_messages", ["is_deleted"])


def downgrade() -> None:
    op.drop_table("shoutbox_messages")
    op.drop_table("reactions")
    op.drop_table("posts")
    op.drop_table("threads")
    op.drop_table("sections")
    op.drop_table("user_roles")
    op.drop_table("roles")
    op.drop_table("users")
