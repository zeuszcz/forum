from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, asc, delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shoutbox import ChatMute, ShoutboxMessage
from app.models.user import User
from app.schemas.shoutbox import ShoutboxCreate, ShoutboxUpdate

# How many messages to keep visible per page
TAIL_LIMIT = 50
EDIT_WINDOW = timedelta(minutes=5)


async def list_recent(
    db: AsyncSession,
    *,
    limit: int = TAIL_LIMIT,
    before_id: int | None = None,
) -> list[ShoutboxMessage]:
    """Return up to `limit` non-deleted messages older than `before_id` (exclusive),
    or the most recent `limit` if `before_id` is None. Result is chronological (asc)."""
    stmt = select(ShoutboxMessage).where(ShoutboxMessage.is_deleted.is_(False))
    if before_id is not None:
        stmt = stmt.where(ShoutboxMessage.id < before_id)
    stmt = stmt.order_by(desc(ShoutboxMessage.id)).limit(limit)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    rows.reverse()
    return rows


async def list_pinned(db: AsyncSession) -> list[ShoutboxMessage]:
    result = await db.execute(
        select(ShoutboxMessage)
        .where(
            and_(
                ShoutboxMessage.is_pinned.is_(True),
                ShoutboxMessage.is_deleted.is_(False),
            )
        )
        .order_by(asc(ShoutboxMessage.id))
    )
    return list(result.scalars().all())


async def get_message(db: AsyncSession, message_id: int) -> ShoutboxMessage:
    row = await db.get(ShoutboxMessage, message_id)
    if row is None or row.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Сообщение не найдено"
        )
    return row


async def post(
    db: AsyncSession, *, author: User, payload: ShoutboxCreate
) -> ShoutboxMessage:
    from app.services.admin import is_currently_banned, is_currently_muted

    if is_currently_banned(author):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Ты забанен{': ' + author.ban_reason if author.ban_reason else ''}",
        )
    if is_currently_muted(author):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Тебе закрыли голос в чате{': ' + author.mute_reason if author.mute_reason else ''}",
        )

    chat_mute = await get_active_chat_mute(db, author.id)
    if chat_mute is not None:
        suffix = f": {chat_mute.reason}" if chat_mute.reason else ""
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Чат-мут до {chat_mute.until.isoformat()}{suffix}",
        )

    msg = ShoutboxMessage(author_id=author.id, body=payload.body.strip())
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def update_message(
    db: AsyncSession,
    *,
    message: ShoutboxMessage,
    actor: User,
    payload: ShoutboxUpdate,
    bypass_window: bool,
) -> ShoutboxMessage:
    if message.author_id != actor.id and not bypass_window:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Можно редактировать только свои сообщения",
        )
    if not bypass_window:
        if datetime.now(UTC) - message.created_at > EDIT_WINDOW:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Окно редактирования (5 мин) истекло",
            )
    message.body = payload.body.strip()
    message.edited_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(message)
    return message


async def soft_delete(
    db: AsyncSession,
    *,
    message: ShoutboxMessage,
    actor: User,
    is_staff: bool,
) -> None:
    if message.author_id != actor.id and not is_staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Можно удалять только свои сообщения",
        )
    message.is_deleted = True
    message.is_pinned = False
    await db.commit()


async def set_pinned(
    db: AsyncSession,
    *,
    message: ShoutboxMessage,
    pinned: bool,
) -> tuple[ShoutboxMessage, list[int]]:
    """Pin or unpin a message. Returns (target, unpinned_ids) — unpinned_ids lists
    any other rows that lost their pin (we keep at most 1 pin at a time)."""
    unpinned: list[int] = []
    if pinned:
        # demote any existing pins so we always show only one
        existing = await db.execute(
            select(ShoutboxMessage).where(
                and_(
                    ShoutboxMessage.is_pinned.is_(True),
                    ShoutboxMessage.id != message.id,
                )
            )
        )
        for row in existing.scalars().all():
            row.is_pinned = False
            unpinned.append(row.id)
    message.is_pinned = pinned
    await db.commit()
    await db.refresh(message)
    return message, unpinned


async def get_active_chat_mute(
    db: AsyncSession, user_id: int
) -> ChatMute | None:
    result = await db.execute(
        select(ChatMute).where(
            and_(
                ChatMute.user_id == user_id,
                ChatMute.until > datetime.now(UTC),
            )
        )
    )
    return result.scalar_one_or_none()


async def mute_user(
    db: AsyncSession,
    *,
    target_user_id: int,
    duration_min: int,
    reason: str | None,
    actor_id: int,
) -> ChatMute:
    until = datetime.now(UTC) + timedelta(minutes=duration_min)
    existing = await db.execute(
        select(ChatMute).where(ChatMute.user_id == target_user_id)
    )
    row = existing.scalar_one_or_none()
    if row is None:
        row = ChatMute(
            user_id=target_user_id,
            until=until,
            reason=reason,
            created_by_id=actor_id,
        )
        db.add(row)
    else:
        row.until = until
        row.reason = reason
        row.created_by_id = actor_id
    await db.commit()
    await db.refresh(row)
    return row


async def unmute_user(db: AsyncSession, *, target_user_id: int) -> None:
    await db.execute(delete(ChatMute).where(ChatMute.user_id == target_user_id))
    await db.commit()


__all__ = [
    "EDIT_WINDOW",
    "TAIL_LIMIT",
    "get_active_chat_mute",
    "get_message",
    "list_pinned",
    "list_recent",
    "mute_user",
    "post",
    "set_pinned",
    "soft_delete",
    "unmute_user",
    "update_message",
]
