"""Forum-side store of which jbf_uaio effects are currently on which
players. Updated whenever a staff member fires an action through the
RCON gateway — `/cs-rcon/action` calls `grant` for ON-toggles and
`revoke` for OFF-toggles."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cs_active_effect import CsActiveEffect


async def grant(
    db: AsyncSession,
    *,
    steamid: str,
    effect_slug: str,
    effect_label: str,
    effect_emoji: str | None,
    granted_by_id: int,
    command: str,
    player_nick: str | None,
    duration_s: int | None,
) -> CsActiveEffect:
    """UPSERT one (steamid, effect_slug) record. If duration_s is set,
    expires_at = now + duration_s. Re-granting bumps the timer."""
    now = datetime.now(UTC)
    expires_at = (
        now + timedelta(seconds=duration_s) if duration_s and duration_s > 0 else None
    )

    stmt = pg_insert(CsActiveEffect).values(
        steamid=steamid,
        effect_slug=effect_slug,
        effect_label=effect_label,
        effect_emoji=effect_emoji,
        granted_by_id=granted_by_id,
        granted_at=now,
        expires_at=expires_at,
        command=command[:500],
        player_nick=player_nick,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["steamid", "effect_slug"],
        set_={
            "effect_label": stmt.excluded.effect_label,
            "effect_emoji": stmt.excluded.effect_emoji,
            "granted_by_id": stmt.excluded.granted_by_id,
            "granted_at": stmt.excluded.granted_at,
            "expires_at": stmt.excluded.expires_at,
            "command": stmt.excluded.command,
            "player_nick": stmt.excluded.player_nick,
        },
    )
    await db.execute(stmt)
    await db.commit()

    # Return the fresh row for the caller.
    result = await db.execute(
        select(CsActiveEffect).where(
            and_(
                CsActiveEffect.steamid == steamid,
                CsActiveEffect.effect_slug == effect_slug,
            )
        )
    )
    return result.scalar_one()


async def revoke(
    db: AsyncSession, *, steamid: str, effect_slug: str
) -> bool:
    """Delete one effect record. Returns True if a row was removed."""
    result = await db.execute(
        delete(CsActiveEffect).where(
            and_(
                CsActiveEffect.steamid == steamid,
                CsActiveEffect.effect_slug == effect_slug,
            )
        )
    )
    await db.commit()
    return (result.rowcount or 0) > 0


async def list_active(
    db: AsyncSession,
    steamids: list[str],
    *,
    include_expired: bool = False,
) -> list[CsActiveEffect]:
    """Return all rows for the given steamids. By default filters out
    rows where expires_at < now (the server has already auto-cleared the
    effect, our cache row is stale)."""
    if not steamids:
        return []
    now = datetime.now(UTC)
    stmt = select(CsActiveEffect).where(CsActiveEffect.steamid.in_(steamids))
    if not include_expired:
        stmt = stmt.where(
            or_(
                CsActiveEffect.expires_at.is_(None),
                CsActiveEffect.expires_at > now,
            )
        )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def cleanup_expired(db: AsyncSession) -> int:
    """Best-effort GC of expired rows. Safe to call periodically; not
    strictly required since list_active filters anyway."""
    now = datetime.now(UTC)
    result = await db.execute(
        delete(CsActiveEffect).where(
            and_(
                CsActiveEffect.expires_at.is_not(None),
                CsActiveEffect.expires_at <= now,
            )
        )
    )
    await db.commit()
    return result.rowcount or 0


__all__ = ["cleanup_expired", "grant", "list_active", "revoke"]
