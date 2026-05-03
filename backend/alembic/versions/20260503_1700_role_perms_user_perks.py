"""granular role permissions + user granted perks

Revision ID: 20260503_1700
Revises: 20260503_1500
Create Date: 2026-05-03

Adds 7 permission booleans on roles, lets owner/admin/curator/moderator get
the appropriate defaults backfilled. Adds users.granted_perks (text array)
for manually-unlocked features bypassing the level gate.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260503_1700"
down_revision: str | None = "20260503_1500"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PERMISSION_COLS = [
    "can_ban",
    "can_mute",
    "can_manage_threads",
    "can_manage_users",
    "can_manage_roles",
    "can_grant_perks",
    "can_view_audit",
]


def upgrade() -> None:
    # ---- Role permission columns ----
    for col in PERMISSION_COLS:
        op.add_column(
            "roles",
            sa.Column(col, sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    # owner + admin → all permissions
    op.execute(
        f"""
        UPDATE roles
        SET {", ".join(f"{c}=true" for c in PERMISSION_COLS)}
        WHERE slug IN ('owner', 'admin')
        """
    )
    # curator → ban + mute + manage_threads + view_audit
    op.execute(
        """
        UPDATE roles
        SET can_ban=true, can_mute=true, can_manage_threads=true, can_view_audit=true
        WHERE slug = 'curator'
        """
    )
    # moderator → mute + manage_threads
    op.execute(
        """
        UPDATE roles
        SET can_mute=true, can_manage_threads=true
        WHERE slug = 'moderator'
        """
    )

    # ---- users.granted_perks (text[]) ----
    op.add_column(
        "users",
        sa.Column(
            "granted_perks",
            postgresql.ARRAY(sa.String(length=32)),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "granted_perks")
    for col in PERMISSION_COLS:
        op.drop_column("roles", col)
