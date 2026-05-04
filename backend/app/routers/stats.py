from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import select, text

from app.core.deps import DbSession

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/activity")
async def activity_timeline(
    db: DbSession,
    hours: int = Query(24, ge=1, le=168),
) -> dict:
    """
    Returns post counts bucketed by hour for the last `hours`. Zero-fills
    empty buckets with generate_series so the sparkline / ECG line is
    continuous.
    """
    sql = text(
        """
        WITH series AS (
            SELECT generate_series(
                date_trunc('hour', NOW() - (:hours || ' hours')::interval),
                date_trunc('hour', NOW()),
                '1 hour'::interval
            ) AS hour
        )
        SELECT
            s.hour AT TIME ZONE 'UTC' AS hour,
            COALESCE(p.cnt, 0) AS posts,
            COALESCE(t.cnt, 0) AS threads
        FROM series s
        LEFT JOIN (
            SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS cnt
            FROM posts
            WHERE created_at >= NOW() - (:hours || ' hours')::interval
              AND NOT is_deleted
            GROUP BY 1
        ) p ON s.hour = p.hour
        LEFT JOIN (
            SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS cnt
            FROM threads
            WHERE created_at >= NOW() - (:hours || ' hours')::interval
              AND NOT is_deleted
            GROUP BY 1
        ) t ON s.hour = t.hour
        ORDER BY s.hour
        """
    )
    rows = (await db.execute(sql, {"hours": str(hours)})).mappings().all()
    return {
        "buckets": [
            {
                "hour": row["hour"].isoformat() if row["hour"] else None,
                "posts": int(row["posts"]),
                "threads": int(row["threads"]),
            }
            for row in rows
        ],
        "hours": hours,
    }


@router.get("/sections/{slug}/sparkline")
async def section_sparkline(slug: str, db: DbSession, hours: int = 24) -> dict:
    """Per-section post counts bucketed by hour for the last 24h."""
    sql = text(
        """
        WITH series AS (
            SELECT generate_series(
                date_trunc('hour', NOW() - (:hours || ' hours')::interval),
                date_trunc('hour', NOW()),
                '1 hour'::interval
            ) AS hour
        ),
        sec AS (
            SELECT id FROM sections WHERE slug = :slug
        )
        SELECT s.hour, COALESCE(p.cnt, 0) AS cnt
        FROM series s
        LEFT JOIN (
            SELECT date_trunc('hour', p.created_at) AS hour, COUNT(*) AS cnt
            FROM posts p
            JOIN threads t ON t.id = p.thread_id
            JOIN sec ON sec.id = t.section_id
            WHERE p.created_at >= NOW() - (:hours || ' hours')::interval
              AND NOT p.is_deleted
            GROUP BY 1
        ) p ON s.hour = p.hour
        ORDER BY s.hour
        """
    )
    rows = (await db.execute(sql, {"slug": slug, "hours": str(hours)})).mappings().all()
    return {"slug": slug, "values": [int(r["cnt"]) for r in rows]}


@router.get("/sparklines")
async def all_sparklines(db: DbSession, hours: int = 24) -> list[dict]:
    """Bulk: per-section sparkline arrays for all sections (for index page)."""
    sql = text(
        """
        WITH series AS (
            SELECT generate_series(
                date_trunc('hour', NOW() - (:hours || ' hours')::interval),
                date_trunc('hour', NOW()),
                '1 hour'::interval
            ) AS hour
        ),
        per_section AS (
            SELECT
                t.section_id,
                date_trunc('hour', p.created_at) AS hour,
                COUNT(*) AS cnt
            FROM posts p
            JOIN threads t ON t.id = p.thread_id
            WHERE p.created_at >= NOW() - (:hours || ' hours')::interval
              AND NOT p.is_deleted
            GROUP BY t.section_id, hour
        )
        SELECT
            sec.id AS section_id,
            sec.slug AS slug,
            s.hour,
            COALESCE(ps.cnt, 0) AS cnt
        FROM sections sec
        CROSS JOIN series s
        LEFT JOIN per_section ps ON ps.section_id = sec.id AND ps.hour = s.hour
        ORDER BY sec.id, s.hour
        """
    )
    rows = (await db.execute(sql, {"hours": str(hours)})).mappings().all()
    grouped: dict[str, list[int]] = {}
    for r in rows:
        grouped.setdefault(r["slug"], []).append(int(r["cnt"]))
    return [{"slug": slug, "values": values} for slug, values in grouped.items()]


@router.get("/scandal-of-week")
async def scandal_of_week(db: DbSession) -> dict | None:
    """Find the most-discussed thread in the last 7 days. Score is a
    rough engagement metric: replies × 2 + log-bounded views.
    Returns null if no qualifying thread."""
    from app.models.thread import Thread

    sql = text(
        """
        SELECT t.id, t.title, t.slug, t.section_id, t.reply_count, t.view_count,
               t.last_post_at, t.created_at, t.author_id,
               (t.reply_count * 2 + LEAST(t.view_count, 200) * 0.05) AS score
        FROM threads t
        WHERE NOT t.is_deleted
          AND t.created_at >= NOW() - INTERVAL '7 days'
        ORDER BY score DESC, t.last_post_at DESC NULLS LAST
        LIMIT 1
        """
    )
    row = (await db.execute(sql)).mappings().first()
    if row is None or row["reply_count"] == 0:
        return None

    # Resolve section + author for richer rendering
    sec_q = await db.execute(
        text("SELECT slug, title FROM sections WHERE id = :sid"),
        {"sid": row["section_id"]},
    )
    sec = sec_q.mappings().first()
    author_q = await db.execute(
        text("SELECT id, nickname FROM users WHERE id = :uid"),
        {"uid": row["author_id"]},
    )
    author = author_q.mappings().first()
    return {
        "id": int(row["id"]),
        "title": row["title"],
        "slug": row["slug"],
        "section_slug": sec["slug"] if sec else None,
        "section_title": sec["title"] if sec else None,
        "reply_count": int(row["reply_count"]),
        "view_count": int(row["view_count"]),
        "score": float(row["score"]),
        "last_post_at": row["last_post_at"].isoformat() if row["last_post_at"] else None,
        "created_at": row["created_at"].isoformat(),
        "author_nickname": author["nickname"] if author else None,
    }


@router.get("/banlist")
async def banlist(
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
    include_expired: bool = Query(False),
) -> list[dict]:
    """Public list of currently-banned users (and optionally expired bans).
    Driven by users.is_banned + users.banned_until.
    """
    from app.models.user import User

    q = select(User).where(User.is_banned.is_(True))
    if not include_expired:
        # Only currently-active bans
        from datetime import UTC, datetime as _dt
        from sqlalchemy import or_

        q = q.where(or_(User.banned_until.is_(None), User.banned_until > _dt.now(UTC)))

    rows = await db.execute(q.order_by(User.banned_until.is_(None).desc(), User.banned_until.desc()).limit(limit))
    users = list(rows.scalars().all())
    return [
        {
            "id": u.id,
            "nickname": u.nickname,
            "avatar_url": u.avatar_url,
            "ban_reason": u.ban_reason,
            "banned_until": u.banned_until.isoformat() if u.banned_until else None,
        }
        for u in users
    ]


@router.get("/archive")
async def archive(
    db: DbSession, limit: int = Query(30, ge=1, le=100)
) -> list[dict]:
    """Soft-deleted threads, newest first."""
    from app.models.thread import Thread

    rows = await db.execute(
        select(Thread)
        .where(Thread.is_deleted.is_(True))
        .order_by(Thread.updated_at.desc())
        .limit(limit)
    )
    threads = list(rows.scalars().all())
    return [
        {
            "id": t.id,
            "title": t.title,
            "section_id": t.section_id,
            "reply_count": t.reply_count,
            "view_count": t.view_count,
            "created_at": t.created_at.isoformat(),
            "deleted_at": t.updated_at.isoformat(),
        }
        for t in threads
    ]


@router.get("/feed")
async def activity_feed(db: DbSession, limit: int = Query(30, ge=1, le=100)) -> list[dict]:
    """Mixed live feed of recent forum events. Each entry has a kind discriminator
    and the actor's UserPublic (nickname + roles + level info).

    Frontend polls this every ~20s to render a "Что происходит" sidebar.
    """
    from datetime import datetime as _dt

    from app.models.thread import Post, Reaction, Thread
    from app.models.user import User
    from sqlalchemy import desc as _desc, select as _select
    from sqlalchemy.orm import aliased as _aliased

    # Pull a generous slice of each event type, then merge & trim
    fetch = limit * 2

    threads_rows = await db.execute(
        _select(Thread)
        .where(Thread.is_deleted.is_(False))
        .order_by(_desc(Thread.created_at))
        .limit(fetch)
    )
    threads = list(threads_rows.scalars().all())

    posts_rows = await db.execute(
        _select(Post)
        .where(Post.is_deleted.is_(False), Post.is_first.is_(False))
        .order_by(_desc(Post.created_at))
        .limit(fetch)
    )
    posts_list = list(posts_rows.scalars().all())

    reactions_rows = await db.execute(
        _select(Reaction).order_by(_desc(Reaction.created_at)).limit(fetch)
    )
    reactions_list = list(reactions_rows.scalars().all())

    users_rows = await db.execute(
        _select(User)
        .where(User.is_active.is_(True))
        .order_by(_desc(User.created_at))
        .limit(fetch)
    )
    users_list = list(users_rows.scalars().all())

    # Resolve thread titles for posts and reactions
    needed_thread_ids: set[int] = set()
    needed_thread_ids.update(t.id for t in threads)
    needed_thread_ids.update(p.thread_id for p in posts_list)
    needed_post_ids = {r.post_id for r in reactions_list}
    if needed_post_ids:
        post_threads = await db.execute(
            _select(Post.id, Post.thread_id).where(Post.id.in_(needed_post_ids))
        )
        post_thread_map: dict[int, int] = {pid: tid for pid, tid in post_threads.all()}
        needed_thread_ids.update(post_thread_map.values())
    else:
        post_thread_map = {}

    thread_titles: dict[int, str] = {}
    if needed_thread_ids:
        tt = await db.execute(
            _select(Thread.id, Thread.title).where(Thread.id.in_(needed_thread_ids))
        )
        thread_titles = {tid: title for tid, title in tt.all()}

    # Resolve users in one fetch
    user_ids: set[int] = set()
    user_ids.update(t.author_id for t in threads if t.author_id)
    user_ids.update(p.author_id for p in posts_list if p.author_id)
    user_ids.update(r.user_id for r in reactions_list if r.user_id)
    user_ids.update(u.id for u in users_list)

    users_map: dict[int, User] = {}
    if user_ids:
        ures = await db.execute(_select(User).where(User.id.in_(user_ids)))
        users_map = {u.id: u for u in ures.scalars().all()}

    # Batch-fetch top role per user so feed nicknames render with role color.
    # Single query joins user_roles + roles, ordered so the lowest display_order
    # wins per user — first row per user_id is their "top" role.
    user_top_role: dict[int, dict] = {}
    if user_ids:
        from app.models.role import Role, UserRole

        rr = await db.execute(
            _select(UserRole.user_id, Role.slug, Role.title, Role.color, Role.is_staff)
            .join(Role, Role.id == UserRole.role_id)
            .where(UserRole.user_id.in_(user_ids))
            .order_by(UserRole.user_id, Role.display_order)
        )
        for uid_, slug, title, color, is_staff in rr.all():
            if uid_ not in user_top_role:
                user_top_role[uid_] = {
                    "slug": slug,
                    "title": title,
                    "color": color,
                    "is_staff": is_staff,
                }

    def _user_dict(uid: int | None) -> dict | None:
        if uid is None:
            return None
        u = users_map.get(uid)
        if u is None:
            return None
        top = user_top_role.get(u.id)
        return {
            "id": u.id,
            "nickname": u.nickname,
            "avatar_url": u.avatar_url,
            "title": u.title,
            "is_active": u.is_active,
            "last_seen_at": u.last_seen_at.isoformat() if u.last_seen_at else None,
            "created_at": u.created_at.isoformat(),
            "roles": [top] if top else [],
            "total_posts": u.total_posts,
            "total_reactions_received": u.total_reactions_received,
            "granted_perks": list(u.granted_perks or []),
            "birthday": u.birthday.isoformat() if u.birthday else None,
            "nick_color": u.nick_color,
            "avatar_glow_color": u.avatar_glow_color,
        }

    events: list[dict] = []
    for t in threads:
        events.append(
            {
                "kind": "thread_created",
                "ts": t.created_at.isoformat(),
                "actor": _user_dict(t.author_id),
                "thread_id": t.id,
                "thread_title": thread_titles.get(t.id),
                "post_id": None,
            }
        )
    for p in posts_list:
        events.append(
            {
                "kind": "post_created",
                "ts": p.created_at.isoformat(),
                "actor": _user_dict(p.author_id),
                "thread_id": p.thread_id,
                "thread_title": thread_titles.get(p.thread_id),
                "post_id": p.id,
            }
        )
    for r in reactions_list:
        tid = post_thread_map.get(r.post_id)
        events.append(
            {
                "kind": "reaction",
                "ts": r.created_at.isoformat(),
                "actor": _user_dict(r.user_id),
                "thread_id": tid,
                "thread_title": thread_titles.get(tid) if tid else None,
                "post_id": r.post_id,
            }
        )
    for u in users_list:
        events.append(
            {
                "kind": "user_registered",
                "ts": u.created_at.isoformat(),
                "actor": _user_dict(u.id),
                "thread_id": None,
                "thread_title": None,
                "post_id": None,
            }
        )

    # Newest first
    events.sort(key=lambda e: e["ts"], reverse=True)
    return events[:limit]


@router.get("/section-pulse")
async def section_pulse(db: DbSession, minutes: int = Query(10, ge=1, le=120)) -> list[dict]:
    """Per-section count of posts in the last `minutes`. Used to show a
    'hot' indicator on each section card."""
    sql = text(
        """
        SELECT t.section_id, COUNT(*) AS cnt
        FROM posts p
        JOIN threads t ON t.id = p.thread_id
        WHERE p.created_at >= NOW() - (:minutes || ' minutes')::interval
          AND NOT p.is_deleted
        GROUP BY t.section_id
        """
    )
    rows = (
        await db.execute(sql, {"minutes": str(minutes)})
    ).mappings().all()
    return [{"section_id": int(r["section_id"]), "count": int(r["cnt"])} for r in rows]


@router.get("/top-users")
async def top_users(
    db: DbSession,
    period: Literal["day", "week", "month"] = "week",
    limit: int = Query(3, ge=1, le=10),
) -> list[dict]:
    """Top users by post count + reactions received in the period."""
    days = {"day": 1, "week": 7, "month": 30}[period]
    sql = text(
        """
        WITH window_posts AS (
            SELECT author_id, COUNT(*) AS post_cnt
            FROM posts
            WHERE created_at >= NOW() - (:days || ' days')::interval
              AND NOT is_deleted
              AND author_id IS NOT NULL
            GROUP BY author_id
        ),
        window_reactions AS (
            SELECT p.author_id, COUNT(*) AS react_cnt
            FROM reactions r
            JOIN posts p ON p.id = r.post_id
            WHERE r.created_at >= NOW() - (:days || ' days')::interval
              AND p.author_id IS NOT NULL
            GROUP BY p.author_id
        )
        SELECT
            u.id, u.nickname, u.avatar_url, u.title,
            u.nick_color, u.avatar_glow_color, u.granted_perks,
            u.total_posts, u.total_reactions_received,
            COALESCE(wp.post_cnt, 0) AS posts,
            COALESCE(wr.react_cnt, 0) AS reactions,
            (COALESCE(wp.post_cnt, 0) * 2 + COALESCE(wr.react_cnt, 0) * 3) AS score
        FROM users u
        LEFT JOIN window_posts wp ON wp.author_id = u.id
        LEFT JOIN window_reactions wr ON wr.author_id = u.id
        WHERE u.is_active = true
          AND (COALESCE(wp.post_cnt, 0) > 0 OR COALESCE(wr.react_cnt, 0) > 0)
        ORDER BY score DESC
        LIMIT :limit
        """
    )
    rows = (await db.execute(sql, {"days": str(days), "limit": limit})).mappings().all()
    return [
        {
            "id": r["id"],
            "nickname": r["nickname"],
            "avatar_url": r["avatar_url"],
            "title": r["title"],
            "posts": int(r["posts"]),
            "reactions": int(r["reactions"]),
            "score": int(r["score"]),
            "rank": idx + 1,
            "nick_color": r["nick_color"],
            "avatar_glow_color": r["avatar_glow_color"],
            "granted_perks": list(r["granted_perks"] or []),
            "total_posts": int(r["total_posts"]),
            "total_reactions_received": int(r["total_reactions_received"]),
        }
        for idx, r in enumerate(rows)
    ]
