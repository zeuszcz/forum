"""Perk grants composition.

Permanent perks live in users.granted_perks (ARRAY of slugs). Time-bounded
grants live in user_perk_grants. The "effective" set returned to clients
is the union of:
    - users.granted_perks (cosmetic, never expires)
    - user_perk_grants WHERE expires_at IS NULL OR expires_at > now()

For UI, we also expose the full grants list with expires_at so the user
can see countdowns ("VIP до 2026-06-04 14:30").
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.perk_grant import UserPerkGrant
from app.models.user import User


class GrantOut(TypedDict):
    slug: str
    expires_at: str | None
    source: str | None


async def list_active_grants(db: AsyncSession, user: User) -> list[UserPerkGrant]:
    """Active time-bounded grants only (excludes expired)."""
    now = datetime.now(UTC)
    rows = await db.execute(
        select(UserPerkGrant)
        .where(
            UserPerkGrant.user_id == user.id,
            (UserPerkGrant.expires_at.is_(None) | (UserPerkGrant.expires_at > now)),
        )
        .order_by(UserPerkGrant.expires_at.nulls_last(), UserPerkGrant.granted_at)
    )
    return list(rows.scalars().all())


async def effective_perk_slugs(db: AsyncSession, user: User) -> list[str]:
    """Union of permanent (array) + active time-bounded (rows). Deduped."""
    grants = await list_active_grants(db, user)
    out = set(user.granted_perks or [])
    out.update(g.perk_slug for g in grants)
    return sorted(out)


async def perk_grants_for_api(db: AsyncSession, user: User) -> list[GrantOut]:
    """Full structured list of active grants for frontend display.
    Permanent grants from the array show up here as expires_at=None."""
    grants = await list_active_grants(db, user)
    out: list[GrantOut] = []
    seen: set[str] = set()
    # Time-bounded first (most likely to need expiry display)
    for g in grants:
        if g.perk_slug in seen:
            continue
        seen.add(g.perk_slug)
        out.append(
            {
                "slug": g.perk_slug,
                "expires_at": g.expires_at.isoformat() if g.expires_at else None,
                "source": g.source,
            }
        )
    # Then permanent perks from the array (skipping ones already shown)
    for slug in user.granted_perks or []:
        if slug in seen:
            continue
        seen.add(slug)
        out.append({"slug": slug, "expires_at": None, "source": "permanent"})
    return out


async def grant_perk(
    db: AsyncSession,
    user: User,
    *,
    perk_slug: str,
    duration_days: int | None,
    source: str = "manual",
) -> UserPerkGrant | None:
    """Grant a perk. If duration_days is None → add to user.granted_perks
    permanent array (idempotent). Otherwise → insert a time-bounded row.

    Returns the new UserPerkGrant row if time-bounded, else None.
    """
    if duration_days is None:
        granted = list(user.granted_perks or [])
        if perk_slug not in granted:
            granted.append(perk_slug)
            user.granted_perks = granted
        return None

    now = datetime.now(UTC)
    expires = now + timedelta(days=int(duration_days))
    row = UserPerkGrant(
        user_id=user.id,
        perk_slug=perk_slug,
        granted_at=now,
        expires_at=expires,
        source=source,
    )
    db.add(row)
    return row
