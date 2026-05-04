from __future__ import annotations

import re
import unicodedata
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.section import Section
from app.models.thread import Post, Reaction, Thread
from app.models.user import User
from app.schemas.forum import PostCreate, ThreadCreate


_RE_SLUG_STRIP = re.compile(r"[^a-z0-9]+")
_RE_MENTION = re.compile(r"@([a-z0-9_\-\.]{3,32})", re.IGNORECASE)


async def _create_mention_notifications(
    db: AsyncSession,
    *,
    body: str,
    actor: User,
    thread_id: int,
    post_id: int,
    thread_title: str | None,
) -> None:
    """Scan post body for @nicknames and create Notification rows for each
    mentioned user (excluding the actor themselves). Best-effort."""
    try:
        from sqlalchemy import func as _func

        from app.models.notification import Notification

        nicknames = {m.lower() for m in _RE_MENTION.findall(body)}
        if not nicknames:
            return
        rows = await db.execute(
            select(User).where(_func.lower(User.nickname).in_(list(nicknames)))
        )
        users = list(rows.scalars().all())
        for u in users:
            if u.id == actor.id:
                continue
            db.add(
                Notification(
                    user_id=u.id,
                    kind="mention",
                    title=f"{actor.nickname} упомянул тебя",
                    body=(thread_title or "")[:500] or None,
                    href=f"/t/{thread_id}#post-{post_id}",
                )
            )
    except Exception:  # noqa: BLE001
        pass


def slugify(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii").lower()
    if not ascii_str.strip():
        # transliterate cyrillic basics
        cyrillic = {
            "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
            "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
            "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
            "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ы": "y",
            "э": "e", "ю": "yu", "я": "ya", "ъ": "", "ь": "",
        }
        ascii_str = "".join(cyrillic.get(ch, ch) for ch in value.lower())
    slug = _RE_SLUG_STRIP.sub("-", ascii_str).strip("-")
    return (slug or "thread")[:200]


async def list_sections(db: AsyncSession) -> list[Section]:
    result = await db.execute(select(Section).order_by(Section.display_order, Section.id))
    return list(result.scalars().all())


async def get_section_by_slug(db: AsyncSession, slug: str) -> Section:
    result = await db.execute(select(Section).where(Section.slug == slug))
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Раздел не найден")
    return section


async def list_threads_by_section(
    db: AsyncSession,
    section_id: int,
    *,
    limit: int = 30,
    offset: int = 0,
) -> tuple[list[Thread], int]:
    base = select(Thread).where(Thread.section_id == section_id, Thread.is_deleted.is_(False))

    total_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_q.scalar_one()

    rows = await db.execute(
        base.order_by(desc(Thread.is_pinned), desc(Thread.last_post_at), desc(Thread.created_at))
        .limit(limit)
        .offset(offset)
    )
    return list(rows.scalars().all()), total


async def list_recent_threads(db: AsyncSession, *, limit: int = 10) -> list[Thread]:
    result = await db.execute(
        select(Thread)
        .where(Thread.is_deleted.is_(False))
        .order_by(desc(Thread.last_post_at), desc(Thread.created_at))
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_hot_threads(db: AsyncSession, *, limit: int = 5, hours: int = 24) -> list[Thread]:
    """Threads with the most activity in the last `hours`. Score = replies in
    window + view_count weight."""
    from sqlalchemy import text as _text

    sql = _text(
        """
        SELECT t.*
        FROM threads t
        WHERE NOT t.is_deleted
          AND (t.last_post_at IS NULL OR t.last_post_at >= NOW() - (:hours || ' hours')::interval)
        ORDER BY (t.reply_count * 1.5 + LEAST(t.view_count, 200) * 0.05) DESC,
                 t.last_post_at DESC NULLS LAST
        LIMIT :limit
        """
    )
    rows = (await db.execute(sql, {"hours": str(hours), "limit": limit})).mappings().all()
    out: list[Thread] = []
    for r in rows:
        thread = await db.get(Thread, r["id"])
        if thread is not None:
            out.append(thread)
    return out


async def edit_post(
    db: AsyncSession, *, post: Post, new_body: str, editor_id: int | None = None
) -> Post:
    from datetime import UTC, datetime
    post.body = new_body
    post.edited_at = datetime.now(UTC)
    if editor_id is not None:
        post.edited_by_id = editor_id
    await db.commit()
    await db.refresh(post)
    return post


async def get_thread_with_posts(
    db: AsyncSession,
    thread_id: int,
    *,
    increment_views: bool = True,
    current_user_id: int | None = None,
) -> tuple[Thread, list[Post], Section, dict[int, dict]]:
    thread_q = await db.execute(select(Thread).where(Thread.id == thread_id))
    thread = thread_q.scalar_one_or_none()
    if thread is None or thread.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тема не найдена")

    section_q = await db.execute(select(Section).where(Section.id == thread.section_id))
    section = section_q.scalar_one()

    posts_q = await db.execute(
        select(Post)
        .where(Post.thread_id == thread_id, Post.is_deleted.is_(False))
        .order_by(Post.created_at.asc(), Post.id.asc())
    )
    posts = list(posts_q.scalars().all())

    # reactions counts and user's marks (per-kind aware)
    counts: dict[int, dict] = {}
    if posts:
        post_ids = [p.id for p in posts]
        # Total per post + total per kind
        rk_rows = await db.execute(
            select(Reaction.post_id, Reaction.kind, func.count())
            .where(Reaction.post_id.in_(post_ids))
            .group_by(Reaction.post_id, Reaction.kind)
        )
        for pid, kind, cnt in rk_rows.all():
            entry = counts.setdefault(pid, {"count": 0, "by_kind": {}, "my_kinds": []})
            entry["count"] += int(cnt)
            entry["by_kind"][kind] = int(cnt)
        if current_user_id is not None:
            mine = await db.execute(
                select(Reaction.post_id, Reaction.kind).where(
                    Reaction.post_id.in_(post_ids), Reaction.user_id == current_user_id
                )
            )
            for pid, kind in mine.all():
                entry = counts.setdefault(pid, {"count": 0, "by_kind": {}, "my_kinds": []})
                entry["my_kinds"].append(kind)

    if increment_views:
        thread.view_count += 1
        await db.commit()

    return thread, posts, section, counts


async def create_thread(
    db: AsyncSession,
    *,
    section: Section,
    author: User,
    payload: ThreadCreate,
) -> Thread:
    from app.services.admin import is_currently_banned, is_currently_muted

    if is_currently_banned(author):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Ты забанен{': ' + author.ban_reason if author.ban_reason else ''}",
        )
    if is_currently_muted(author):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Тебе закрыли голос{': ' + author.mute_reason if author.mute_reason else ''}",
        )
    if not author.can_create_threads:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Тебе закрыто создание новых тем",
        )
    if section.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Раздел закрыт для постинга")

    now = datetime.now(UTC)
    thread = Thread(
        section_id=section.id,
        author_id=author.id,
        title=payload.title.strip(),
        slug=slugify(payload.title),
        last_post_at=now,
        last_post_author_id=author.id,
    )
    db.add(thread)
    await db.flush()

    first_post = Post(
        thread_id=thread.id,
        author_id=author.id,
        body=payload.body,
        is_first=True,
    )
    db.add(first_post)
    await db.flush()

    thread.last_post_id = first_post.id

    section.thread_count += 1
    section.post_count += 1
    section.last_thread_id = thread.id

    # Maintain cached author stats
    author.total_posts += 1

    await _create_mention_notifications(
        db,
        body=payload.body,
        actor=author,
        thread_id=thread.id,
        post_id=first_post.id,
        thread_title=thread.title,
    )

    # Quest progression: thread creation also counts as a post for the
    # "post_count" daily quest (consistency with how the user thinks).
    try:
        from app.services import quests as quest_service

        await quest_service.bump_thread_count(db, author)
        await quest_service.bump_post_count(db, author)
    except Exception:  # noqa: BLE001
        pass

    await db.commit()
    await db.refresh(thread)
    return thread


async def create_post(
    db: AsyncSession,
    *,
    thread_id: int,
    author: User,
    payload: PostCreate,
) -> Post:
    from app.services.admin import is_currently_banned, is_currently_muted

    if is_currently_banned(author):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Ты забанен{': ' + author.ban_reason if author.ban_reason else ''}",
        )
    if is_currently_muted(author):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Тебе закрыли голос{': ' + author.mute_reason if author.mute_reason else ''}",
        )
    thread_q = await db.execute(select(Thread).where(Thread.id == thread_id))
    thread = thread_q.scalar_one_or_none()
    if thread is None or thread.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тема не найдена")
    if thread.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Тема закрыта")

    now = datetime.now(UTC)
    post = Post(
        thread_id=thread.id,
        author_id=author.id,
        body=payload.body,
        parent_post_id=payload.parent_post_id,
        is_first=False,
    )
    db.add(post)
    await db.flush()

    thread.reply_count += 1
    thread.last_post_id = post.id
    thread.last_post_at = now
    thread.last_post_author_id = author.id

    section_q = await db.execute(select(Section).where(Section.id == thread.section_id))
    section = section_q.scalar_one()
    section.post_count += 1
    section.last_thread_id = thread.id

    # Maintain cached author stats
    author.total_posts += 1

    # Notify thread author about a new reply (skip self-reply)
    try:
        if thread.author_id and thread.author_id != author.id:
            from app.models.notification import Notification

            db.add(
                Notification(
                    user_id=thread.author_id,
                    kind="reply",
                    title=f"{author.nickname} ответил в твоей теме",
                    body=thread.title[:500],
                    href=f"/t/{thread.id}#post-{post.id}",
                )
            )
    except Exception:  # noqa: BLE001
        pass

    await _create_mention_notifications(
        db,
        body=payload.body,
        actor=author,
        thread_id=thread.id,
        post_id=post.id,
        thread_title=thread.title,
    )

    # Quest progression
    try:
        from app.services import quests as quest_service

        await quest_service.bump_post_count(db, author)
    except Exception:  # noqa: BLE001
        pass

    await db.commit()
    await db.refresh(post)
    return post


REACTION_KINDS: tuple[str, ...] = (
    "like",
    "fire",
    "laugh",
    "wow",
    "sad",
    "thinking",
    "thanks",
)


async def toggle_reaction(
    db: AsyncSession, *, post_id: int, user_id: int, kind: str = "like"
) -> dict:
    if kind not in REACTION_KINDS:
        raise HTTPException(status_code=400, detail=f"Unknown reaction kind: {kind}")
    # ensure post exists; we also need its author to bump their cached counter
    p_q = await db.execute(select(Post).where(Post.id == post_id))
    post = p_q.scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пост не найден")

    existing_q = await db.execute(
        select(Reaction).where(
            Reaction.post_id == post_id, Reaction.user_id == user_id, Reaction.kind == kind
        )
    )
    existing = existing_q.scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
        delta = -1
        reacted = False
    else:
        db.add(Reaction(post_id=post_id, user_id=user_id, kind=kind))
        delta = 1
        reacted = True

    # Maintain cached author counters (received reactions, plus thanks_received
    # as a dedicated reputation metric).
    author_user: User | None = None
    if post.author_id is not None and post.author_id != user_id:
        author_q = await db.execute(select(User).where(User.id == post.author_id))
        author_user = author_q.scalar_one_or_none()
        if author_user is not None:
            author_user.total_reactions_received = max(
                0, author_user.total_reactions_received + delta
            )
            if kind == "thanks":
                author_user.thanks_received = max(
                    0, author_user.thanks_received + delta
                )

    # Quest progression: only on positive reaction events (delta=+1).
    if delta > 0:
        try:
            from app.services import quests as quest_service

            actor_q = await db.execute(select(User).where(User.id == user_id))
            actor = actor_q.scalar_one_or_none()
            if actor is not None:
                await quest_service.bump_react_given(db, actor)
            if author_user is not None:
                await quest_service.bump_react_received(db, author_user)
        except Exception:  # noqa: BLE001
            pass

    await db.commit()

    cnt_q = await db.execute(
        select(func.count()).select_from(Reaction).where(Reaction.post_id == post_id)
    )
    return {"count": cnt_q.scalar_one(), "reacted": reacted, "delta": delta}
