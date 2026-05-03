from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import text

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
        }
        for idx, r in enumerate(rows)
    ]
