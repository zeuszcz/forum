from __future__ import annotations

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shoutbox import ShoutboxMessage
from app.models.user import User
from app.schemas.shoutbox import ShoutboxCreate

# How many messages to keep visible
TAIL_LIMIT = 50


async def list_recent(db: AsyncSession, *, limit: int = TAIL_LIMIT) -> list[ShoutboxMessage]:
    result = await db.execute(
        select(ShoutboxMessage)
        .where(ShoutboxMessage.is_deleted.is_(False))
        .order_by(desc(ShoutboxMessage.created_at))
        .limit(limit)
    )
    rows = list(result.scalars().all())
    rows.reverse()  # chronological for display
    return rows


async def post(db: AsyncSession, *, author: User, payload: ShoutboxCreate) -> ShoutboxMessage:
    from fastapi import HTTPException, status

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

    msg = ShoutboxMessage(author_id=author.id, body=payload.body.strip())
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg
