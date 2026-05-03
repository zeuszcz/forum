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
    db: AsyncSession, *, post: Post, new_body: str
) -> Post:
    from datetime import UTC, datetime
    post.body = new_body
    post.edited_at = datetime.now(UTC)
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

    # reactions counts and user's marks
    counts: dict[int, dict] = {}
    if posts:
        post_ids = [p.id for p in posts]
        rcounts = await db.execute(
            select(Reaction.post_id, func.count())
            .where(Reaction.post_id.in_(post_ids))
            .group_by(Reaction.post_id)
        )
        for pid, cnt in rcounts.all():
            counts[pid] = {"count": cnt, "reacted": False}
        if current_user_id is not None:
            mine = await db.execute(
                select(Reaction.post_id).where(
                    Reaction.post_id.in_(post_ids), Reaction.user_id == current_user_id
                )
            )
            for (pid,) in mine.all():
                counts.setdefault(pid, {"count": 0, "reacted": False})["reacted"] = True

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

    await db.commit()
    await db.refresh(post)
    return post


async def toggle_reaction(
    db: AsyncSession, *, post_id: int, user_id: int, kind: str = "like"
) -> dict:
    existing_q = await db.execute(
        select(Reaction).where(
            Reaction.post_id == post_id, Reaction.user_id == user_id, Reaction.kind == kind
        )
    )
    existing = existing_q.scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
        await db.commit()
        delta = -1
        reacted = False
    else:
        # ensure post exists
        p_q = await db.execute(select(Post).where(Post.id == post_id))
        if p_q.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пост не найден")
        db.add(Reaction(post_id=post_id, user_id=user_id, kind=kind))
        await db.commit()
        delta = 1
        reacted = True

    cnt_q = await db.execute(
        select(func.count()).select_from(Reaction).where(Reaction.post_id == post_id)
    )
    return {"count": cnt_q.scalar_one(), "reacted": reacted, "delta": delta}
