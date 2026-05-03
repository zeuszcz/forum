"""Admin / moderation service.

Functions here always log a row into `moderation_log` for audit purposes.
Restriction enforcement (refusing actions from banned/muted users) lives in
`auth`, `forum`, and `shoutbox` services using `is_currently_banned()` and
`is_currently_muted()` helpers.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.moderation import ModerationLog
from app.models.section import Section
from app.models.thread import Post, Thread
from app.models.user import User


def is_currently_banned(user: User) -> bool:
    if not user.is_banned:
        return False
    if user.banned_until is None:
        return True  # permanent
    return user.banned_until > datetime.now(UTC)


def is_currently_muted(user: User) -> bool:
    if not user.is_muted:
        return False
    if user.muted_until is None:
        return True
    return user.muted_until > datetime.now(UTC)


async def get_user_or_404(db: AsyncSession, user_id: int) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return user


def _expires(duration_hours: int | None) -> datetime | None:
    if duration_hours is None:
        return None
    return datetime.now(UTC) + timedelta(hours=duration_hours)


async def ban_user(
    db: AsyncSession,
    *,
    actor: User,
    target_id: int,
    reason: str | None,
    duration_hours: int | None,
) -> User:
    target = await get_user_or_404(db, target_id)
    if target.id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Себя забанить нельзя"
        )
    target.is_banned = True
    target.ban_reason = reason
    target.banned_until = _expires(duration_hours)
    db.add(
        ModerationLog(
            actor_id=actor.id,
            target_user_id=target.id,
            action="ban",
            reason=reason,
            expires_at=target.banned_until,
        )
    )
    await db.commit()
    await db.refresh(target)
    return target


async def unban_user(
    db: AsyncSession, *, actor: User, target_id: int
) -> User:
    target = await get_user_or_404(db, target_id)
    target.is_banned = False
    target.ban_reason = None
    target.banned_until = None
    db.add(ModerationLog(actor_id=actor.id, target_user_id=target.id, action="unban"))
    await db.commit()
    await db.refresh(target)
    return target


async def mute_user(
    db: AsyncSession,
    *,
    actor: User,
    target_id: int,
    reason: str | None,
    duration_hours: int | None,
) -> User:
    target = await get_user_or_404(db, target_id)
    if target.id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Себя замьютить нельзя"
        )
    target.is_muted = True
    target.mute_reason = reason
    target.muted_until = _expires(duration_hours)
    db.add(
        ModerationLog(
            actor_id=actor.id,
            target_user_id=target.id,
            action="mute",
            reason=reason,
            expires_at=target.muted_until,
        )
    )
    await db.commit()
    await db.refresh(target)
    return target


async def unmute_user(db: AsyncSession, *, actor: User, target_id: int) -> User:
    target = await get_user_or_404(db, target_id)
    target.is_muted = False
    target.mute_reason = None
    target.muted_until = None
    db.add(ModerationLog(actor_id=actor.id, target_user_id=target.id, action="unmute"))
    await db.commit()
    await db.refresh(target)
    return target


async def set_thread_creation(
    db: AsyncSession, *, actor: User, target_id: int, can_create: bool, reason: str | None
) -> User:
    target = await get_user_or_404(db, target_id)
    target.can_create_threads = can_create
    db.add(
        ModerationLog(
            actor_id=actor.id,
            target_user_id=target.id,
            action="user_threads_enabled" if can_create else "user_threads_disabled",
            reason=reason,
        )
    )
    await db.commit()
    await db.refresh(target)
    return target


async def lock_section(
    db: AsyncSession, *, actor: User, slug: str, locked: bool
) -> Section:
    result = await db.execute(select(Section).where(Section.slug == slug))
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Раздел не найден")
    section.is_locked = locked
    db.add(
        ModerationLog(
            actor_id=actor.id,
            target_section_id=section.id,
            action="section_lock" if locked else "section_unlock",
        )
    )
    await db.commit()
    await db.refresh(section)
    return section


async def lock_thread(
    db: AsyncSession, *, actor: User, thread_id: int, locked: bool
) -> Thread:
    result = await db.execute(select(Thread).where(Thread.id == thread_id))
    thread = result.scalar_one_or_none()
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тема не найдена")
    thread.is_locked = locked
    db.add(
        ModerationLog(
            actor_id=actor.id,
            target_thread_id=thread.id,
            action="thread_lock" if locked else "thread_unlock",
        )
    )
    await db.commit()
    await db.refresh(thread)
    return thread


async def delete_post(db: AsyncSession, *, actor: User, post_id: int, reason: str | None) -> Post:
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пост не найден")
    post.is_deleted = True
    db.add(
        ModerationLog(
            actor_id=actor.id,
            target_post_id=post.id,
            action="post_delete",
            reason=reason,
        )
    )
    await db.commit()
    await db.refresh(post)
    return post


async def list_users(
    db: AsyncSession, *, q: str | None, filter: str | None, limit: int, offset: int
) -> tuple[list[User], int]:
    base = select(User)
    if q:
        like = f"%{q.strip().lower()}%"
        from sqlalchemy import func, or_

        base = base.where(
            or_(
                func.lower(User.nickname).like(like),
                func.lower(User.email).like(like),
            )
        )
    if filter == "banned":
        base = base.where(User.is_banned.is_(True))
    elif filter == "muted":
        base = base.where(User.is_muted.is_(True))
    elif filter == "staff":
        from app.models.role import Role, UserRole

        base = base.join(UserRole, UserRole.user_id == User.id).join(
            Role, Role.id == UserRole.role_id
        ).where(Role.is_staff.is_(True)).distinct()

    from sqlalchemy import func as _func

    total_q = await db.execute(_func.count().select().select_from(base.subquery()))
    total = int(total_q.scalar_one())

    rows = await db.execute(base.order_by(desc(User.created_at)).limit(limit).offset(offset))
    return list(rows.scalars().all()), total


async def list_audit(db: AsyncSession, *, limit: int, offset: int) -> list[ModerationLog]:
    result = await db.execute(
        select(ModerationLog).order_by(desc(ModerationLog.created_at)).limit(limit).offset(offset)
    )
    return list(result.scalars().all())
