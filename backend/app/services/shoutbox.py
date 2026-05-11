from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, asc, delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.shoutbox import (
    ChatMute,
    ShoutboxMessage,
    ShoutboxPollVote,
    ShoutboxReaction,
)
from app.models.user import User
from app.schemas.shoutbox import MapVoteCreate, ShoutboxCreate, ShoutboxUpdate

TAIL_LIMIT = 50
EDIT_WINDOW = timedelta(minutes=5)
CLEAR_LIMIT = 200  # safety cap on /clear

REACTION_KINDS: tuple[str, ...] = (
    "like",
    "fire",
    "laugh",
    "wow",
    "sad",
    "thinking",
    "thanks",
)

_RE_MENTION = re.compile(r"@([a-z0-9_\-\.]{3,32})", re.IGNORECASE)


async def list_recent(
    db: AsyncSession,
    *,
    limit: int = TAIL_LIMIT,
    before_id: int | None = None,
) -> list[ShoutboxMessage]:
    # Public chat hides kind="system" — those events are admin-only via
    # /shoutbox/system-log. Without this filter, a burst of bot-cast events
    # (kills/joins/leaves) can fill the latest N rows so the public chat
    # frontend (which filters system out) ends up showing zero messages.
    stmt = (
        select(ShoutboxMessage)
        .where(ShoutboxMessage.is_deleted.is_(False))
        .where(ShoutboxMessage.kind != "system")
    )
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
    db: AsyncSession,
    *,
    author: User,
    payload: ShoutboxCreate,
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

    reply_to_id: int | None = None
    if payload.reply_to_id is not None:
        target = await db.get(ShoutboxMessage, payload.reply_to_id)
        if target is not None and not target.is_deleted:
            reply_to_id = target.id
        # silently drop bad reply_to_id rather than 4xx — message still goes out

    msg = ShoutboxMessage(
        author_id=author.id,
        body=payload.body.strip(),
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    await _create_mention_notifications(db, body=msg.body, actor=author, message_id=msg.id)
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
    unpinned: list[int] = []
    if pinned:
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


# -----------------------------------------------------------------------------
# System bot-cast (game events)
# -----------------------------------------------------------------------------


async def post_system(
    db: AsyncSession,
    *,
    body: str,
    tag: str | None,
    category: str | None,
) -> ShoutboxMessage:
    """Create a kind='system' message. Used by the bot-cast endpoint
    (HMAC-authed), so we skip flood checks and never attach an author."""
    meta: dict[str, Any] = {}
    if tag:
        meta["tag"] = tag
    if category:
        meta["category"] = category
    msg = ShoutboxMessage(
        author_id=None,
        body=body.strip(),
        kind="system",
        meta=meta or None,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


# -----------------------------------------------------------------------------
# Map vote
# -----------------------------------------------------------------------------


async def post_mapvote(
    db: AsyncSession,
    *,
    author: User,
    payload: MapVoteCreate,
) -> ShoutboxMessage:
    options = [o.strip() for o in payload.options if o.strip()]
    if len(options) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нужно минимум 2 варианта",
        )
    if len(options) > 5:
        options = options[:5]
    closes_at = datetime.now(UTC) + timedelta(minutes=payload.duration_min)
    summary = f"🗳️ {payload.question}: " + " · ".join(options)
    msg = ShoutboxMessage(
        author_id=author.id,
        body=summary[:500],
        kind="mapvote",
        meta={
            "question": payload.question,
            "options": options,
            "closes_at": closes_at.isoformat(),
        },
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def cast_vote(
    db: AsyncSession,
    *,
    message_id: int,
    user_id: int,
    option_idx: int,
) -> dict[int, int]:
    msg = await db.get(ShoutboxMessage, message_id)
    if msg is None or msg.is_deleted or msg.kind != "mapvote":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Голосование не найдено"
        )
    meta = msg.meta or {}
    options = meta.get("options") or []
    if option_idx < 0 or option_idx >= len(options):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный вариант"
        )
    closes_at_str = meta.get("closes_at")
    if closes_at_str:
        try:
            closes_at = datetime.fromisoformat(closes_at_str)
            if datetime.now(UTC) > closes_at:
                raise HTTPException(
                    status_code=status.HTTP_410_GONE,
                    detail="Голосование закрыто",
                )
        except ValueError:
            pass

    existing_q = await db.execute(
        select(ShoutboxPollVote).where(
            and_(
                ShoutboxPollVote.message_id == message_id,
                ShoutboxPollVote.user_id == user_id,
            )
        )
    )
    existing = existing_q.scalar_one_or_none()
    if existing is None:
        db.add(
            ShoutboxPollVote(
                message_id=message_id, user_id=user_id, option_idx=option_idx
            )
        )
    else:
        existing.option_idx = option_idx
    await db.commit()
    return await vote_counts_for_message(db, message_id)


async def vote_counts_for_message(
    db: AsyncSession, message_id: int
) -> dict[int, int]:
    rows = await db.execute(
        select(ShoutboxPollVote.option_idx, func.count(ShoutboxPollVote.id))
        .where(ShoutboxPollVote.message_id == message_id)
        .group_by(ShoutboxPollVote.option_idx)
    )
    return {int(idx): int(c) for idx, c in rows.all()}


async def vote_counts_for_messages(
    db: AsyncSession, message_ids: list[int]
) -> dict[int, dict[int, int]]:
    if not message_ids:
        return {}
    rows = await db.execute(
        select(
            ShoutboxPollVote.message_id,
            ShoutboxPollVote.option_idx,
            func.count(ShoutboxPollVote.id),
        )
        .where(ShoutboxPollVote.message_id.in_(message_ids))
        .group_by(ShoutboxPollVote.message_id, ShoutboxPollVote.option_idx)
    )
    out: dict[int, dict[int, int]] = defaultdict(dict)
    for mid, idx, c in rows.all():
        out[int(mid)][int(idx)] = int(c)
    return dict(out)


async def my_votes_for_messages(
    db: AsyncSession, message_ids: list[int], user_id: int
) -> dict[int, int]:
    if not message_ids:
        return {}
    rows = await db.execute(
        select(ShoutboxPollVote.message_id, ShoutboxPollVote.option_idx).where(
            and_(
                ShoutboxPollVote.message_id.in_(message_ids),
                ShoutboxPollVote.user_id == user_id,
            )
        )
    )
    return {int(mid): int(idx) for mid, idx in rows.all()}


# -----------------------------------------------------------------------------
# Reactions
# -----------------------------------------------------------------------------


async def toggle_reaction(
    db: AsyncSession, *, message_id: int, user_id: int, kind: str
) -> dict[str, int]:
    """Toggle a reaction. Returns the up-to-date counts map for the message."""
    if kind not in REACTION_KINDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown reaction kind: {kind}",
        )
    msg = await db.get(ShoutboxMessage, message_id)
    if msg is None or msg.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Сообщение не найдено"
        )
    existing_q = await db.execute(
        select(ShoutboxReaction).where(
            and_(
                ShoutboxReaction.message_id == message_id,
                ShoutboxReaction.user_id == user_id,
                ShoutboxReaction.kind == kind,
            )
        )
    )
    existing = existing_q.scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
    else:
        db.add(
            ShoutboxReaction(message_id=message_id, user_id=user_id, kind=kind)
        )
    await db.commit()
    return await counts_for_message(db, message_id)


async def counts_for_message(db: AsyncSession, message_id: int) -> dict[str, int]:
    rows = await db.execute(
        select(ShoutboxReaction.kind, func.count(ShoutboxReaction.id))
        .where(ShoutboxReaction.message_id == message_id)
        .group_by(ShoutboxReaction.kind)
    )
    return {kind: int(count) for kind, count in rows.all()}


async def reactions_for_messages(
    db: AsyncSession, message_ids: list[int]
) -> dict[int, dict[str, int]]:
    if not message_ids:
        return {}
    rows = await db.execute(
        select(
            ShoutboxReaction.message_id,
            ShoutboxReaction.kind,
            func.count(ShoutboxReaction.id),
        )
        .where(ShoutboxReaction.message_id.in_(message_ids))
        .group_by(ShoutboxReaction.message_id, ShoutboxReaction.kind)
    )
    out: dict[int, dict[str, int]] = defaultdict(dict)
    for mid, kind, count in rows.all():
        out[mid][kind] = int(count)
    return dict(out)


async def reacted_kinds_for_user(
    db: AsyncSession, message_ids: list[int], user_id: int
) -> dict[int, list[str]]:
    if not message_ids:
        return {}
    rows = await db.execute(
        select(ShoutboxReaction.message_id, ShoutboxReaction.kind)
        .where(
            and_(
                ShoutboxReaction.message_id.in_(message_ids),
                ShoutboxReaction.user_id == user_id,
            )
        )
    )
    out: dict[int, list[str]] = defaultdict(list)
    for mid, kind in rows.all():
        out[mid].append(kind)
    return dict(out)


# -----------------------------------------------------------------------------
# Mentions → notifications
# -----------------------------------------------------------------------------


async def _create_mention_notifications(
    db: AsyncSession, *, body: str, actor: User, message_id: int
) -> None:
    """Scan body for @nicknames, create one notification per unique mentioned
    user (excluding the actor). Best-effort — swallow errors so chat posting
    never breaks because of a notification glitch."""
    try:
        nicknames = {m.lower() for m in _RE_MENTION.findall(body)}
        if not nicknames:
            return
        rows = await db.execute(
            select(User).where(func.lower(User.nickname).in_(list(nicknames)))
        )
        users = list(rows.scalars().all())
        snippet = body[:120]
        for u in users:
            if u.id == actor.id:
                continue
            db.add(
                Notification(
                    user_id=u.id,
                    kind="mention",
                    title=f"{actor.nickname} упомянул тебя в чате",
                    body=snippet,
                    href=f"/#chat-{message_id}",
                )
            )
        await db.commit()
    except Exception:  # noqa: BLE001
        pass


# -----------------------------------------------------------------------------
# Clear (mod-only bulk soft-delete)
# -----------------------------------------------------------------------------


async def clear_recent(db: AsyncSession, *, limit: int = CLEAR_LIMIT) -> list[int]:
    """Soft-delete up to `limit` most-recent non-deleted, non-pinned messages.
    Returns the list of affected ids so callers can broadcast `delete` events."""
    cap = min(max(limit, 1), CLEAR_LIMIT)
    rows = await db.execute(
        select(ShoutboxMessage.id)
        .where(
            and_(
                ShoutboxMessage.is_deleted.is_(False),
                ShoutboxMessage.is_pinned.is_(False),
            )
        )
        .order_by(desc(ShoutboxMessage.id))
        .limit(cap)
    )
    ids = [int(r[0]) for r in rows.all()]
    if not ids:
        return []
    await db.execute(
        update(ShoutboxMessage)
        .where(ShoutboxMessage.id.in_(ids))
        .values(is_deleted=True)
    )
    await db.commit()
    return ids


__all__ = [
    "CLEAR_LIMIT",
    "EDIT_WINDOW",
    "REACTION_KINDS",
    "TAIL_LIMIT",
    "cast_vote",
    "clear_recent",
    "counts_for_message",
    "get_active_chat_mute",
    "get_message",
    "list_pinned",
    "list_recent",
    "mute_user",
    "my_votes_for_messages",
    "post",
    "post_mapvote",
    "post_system",
    "reacted_kinds_for_user",
    "reactions_for_messages",
    "set_pinned",
    "soft_delete",
    "toggle_reaction",
    "unmute_user",
    "update_message",
    "vote_counts_for_message",
    "vote_counts_for_messages",
]
