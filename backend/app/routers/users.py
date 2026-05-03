from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import desc, select, text

from app.core.deps import CurrentUser, DbSession
from app.models.user import User
from app.schemas.forum import PostRead, ThreadRead
from app.schemas.user import RoleRead, UserProfileUpdate, UserPublic
from app.services import auth as auth_service

router = APIRouter(prefix="/users", tags=["users"])

ONLINE_WINDOW = timedelta(minutes=10)


@router.get("/online", response_model=list[UserPublic])
async def list_online(db: DbSession) -> list[UserPublic]:
    cutoff = datetime.now(UTC) - ONLINE_WINDOW
    result = await db.execute(
        select(User)
        .where(User.is_active.is_(True), User.last_seen_at.is_not(None), User.last_seen_at >= cutoff)
        .order_by(desc(User.last_seen_at))
        .limit(50)
    )
    users = list(result.scalars().all())
    out: list[UserPublic] = []
    for u in users:
        roles = await auth_service.get_user_roles(db, u.id)
        out.append(
            UserPublic(
                id=u.id,
                nickname=u.nickname,
                avatar_url=u.avatar_url,
                title=u.title,
                bio=u.bio,
                is_active=u.is_active,
                last_seen_at=u.last_seen_at,
                created_at=u.created_at,
                roles=[RoleRead.model_validate(r) for r in roles],
                total_posts=u.total_posts,
                total_reactions_received=u.total_reactions_received,
                granted_perks=list(u.granted_perks or []),
                birthday=u.birthday.isoformat() if u.birthday else None,
                nick_color=u.nick_color,
                avatar_glow_color=u.avatar_glow_color,
            )
        )
    return out


@router.post("/heartbeat")
async def heartbeat(user: CurrentUser, db: DbSession) -> dict[str, str]:
    user.last_seen_at = datetime.now(UTC)
    await db.commit()
    return {"status": "ok"}


def _compute_level(posts: int, reactions: int) -> int:
    """Mirrors lib/rank.ts on the frontend."""
    import math

    xp = max(0, posts * 10 + reactions * 4)
    return int(math.sqrt(xp / 8))


@router.patch("/me", response_model=UserPublic)
async def update_me(payload: UserProfileUpdate, user: CurrentUser, db: DbSession) -> UserPublic:
    """Self-update profile fields.

    Level gates (mirror lib/rank.ts PERKS):
      - bio:        always
      - signature:  level >= 5
      - title:      level >= 25 (custom-title perk)
    Staff bypass: anyone with is_staff role can edit anything.
    """
    roles = await auth_service.get_user_roles(db, user.id)
    is_staff = any(r.is_staff for r in roles)
    level = _compute_level(user.total_posts, user.total_reactions_received)

    if payload.bio is not None:
        user.bio = payload.bio.strip() or None

    granted = set(user.granted_perks or [])

    if payload.signature is not None:
        if not is_staff and level < 5:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Подпись доступна с lvl 5 (сейчас {level})",
            )
        user.signature = payload.signature.strip() or None

    if payload.title is not None:
        if not is_staff and level < 25 and "custom_title" not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Кастомный титул доступен с lvl 25 или выдается админом (сейчас {level})",
            )
        user.title = payload.title.strip() or None

    if payload.birthday is not None:
        from datetime import date as _date

        s = payload.birthday.strip()
        if s == "":
            user.birthday = None
        else:
            try:
                bd = _date.fromisoformat(s)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Неверный формат даты, ожидается YYYY-MM-DD",
                ) from exc
            today = datetime.now(UTC).date()
            if bd > today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="ДР не может быть в будущем",
                )
            if bd.year < 1920:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Слишком ранний год",
                )
            user.birthday = bd

    def _validate_hex(raw: str, label: str) -> str:
        import re

        if not re.fullmatch(r"#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?", raw):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{label}: ожидается hex #RRGGBB или #RRGGBBAA",
            )
        return raw.lower()

    if payload.nick_color is not None:
        s = payload.nick_color.strip()
        if s == "":
            user.nick_color = None
        else:
            if not is_staff and "glow_nick" not in granted and level < 50:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Цвет ника доступен с lvl 50 (glow_nick perk) или от админа (сейчас {level})",
                )
            user.nick_color = _validate_hex(s, "nick_color")

    if payload.avatar_glow_color is not None:
        s = payload.avatar_glow_color.strip()
        if s == "":
            user.avatar_glow_color = None
        else:
            if not is_staff and "animated_frame" not in granted and level < 15:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Цвет свечения аватара доступен с lvl 15 (animated_frame perk) или от админа (сейчас {level})",
                )
            user.avatar_glow_color = _validate_hex(s, "avatar_glow_color")

    await db.commit()
    await db.refresh(user)

    return UserPublic(
        id=user.id,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        title=user.title,
        bio=user.bio,
        is_active=user.is_active,
        last_seen_at=user.last_seen_at,
        created_at=user.created_at,
        roles=[RoleRead.model_validate(r) for r in roles],
        total_posts=user.total_posts,
        total_reactions_received=user.total_reactions_received,
        granted_perks=list(user.granted_perks or []),
        birthday=user.birthday.isoformat() if user.birthday else None,
        nick_color=user.nick_color,
        avatar_glow_color=user.avatar_glow_color,
    )


@router.get("/{nickname}/stats")
async def get_user_stats(nickname: str, db: DbSession) -> dict:
    from sqlalchemy import func as _func, select as _select

    from app.models.thread import Post, Reaction

    user_q = await db.execute(_select(User).where(User.nickname == nickname))
    u = user_q.scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    posts_q = await db.execute(
        _select(_func.count())
        .select_from(Post)
        .where(Post.author_id == u.id, Post.is_deleted.is_(False))
    )
    posts = int(posts_q.scalar_one())

    reactions_q = await db.execute(
        _select(_func.count())
        .select_from(Reaction)
        .join(Post, Post.id == Reaction.post_id)
        .where(Post.author_id == u.id)
    )
    reactions = int(reactions_q.scalar_one())

    return {"posts": posts, "reactions": reactions}


@router.get("/search", response_model=list[UserPublic])
async def search_users(
    db: DbSession,
    q: str = Query(..., min_length=1, max_length=32),
    limit: int = Query(8, ge=1, le=20),
) -> list[UserPublic]:
    """Prefix-match users by nickname for @mention autocomplete."""
    like = f"{q.strip().lower()}%"
    from sqlalchemy import func as _func

    rows = await db.execute(
        select(User)
        .where(_func.lower(User.nickname).like(like), User.is_active.is_(True))
        .order_by(desc(User.last_seen_at).nulls_last(), desc(User.total_posts))
        .limit(limit)
    )
    users = list(rows.scalars().all())
    out: list[UserPublic] = []
    for u in users:
        roles = await auth_service.get_user_roles(db, u.id)
        out.append(
            UserPublic(
                id=u.id,
                nickname=u.nickname,
                avatar_url=u.avatar_url,
                title=u.title,
                bio=u.bio,
                is_active=u.is_active,
                last_seen_at=u.last_seen_at,
                created_at=u.created_at,
                roles=[RoleRead.model_validate(r) for r in roles],
                total_posts=u.total_posts,
                total_reactions_received=u.total_reactions_received,
                granted_perks=list(u.granted_perks or []),
                birthday=u.birthday.isoformat() if u.birthday else None,
                nick_color=u.nick_color,
                avatar_glow_color=u.avatar_glow_color,
            )
        )
    return out


@router.get("/birthdays-today", response_model=list[UserPublic])
async def birthdays_today(db: DbSession) -> list[UserPublic]:
    """Users whose birthday is today (month + day match, year ignored)."""
    today = datetime.now(UTC).date()
    from sqlalchemy import extract as _extract

    rows = await db.execute(
        select(User)
        .where(
            User.is_active.is_(True),
            User.birthday.is_not(None),
            _extract("month", User.birthday) == today.month,
            _extract("day", User.birthday) == today.day,
        )
        .order_by(User.nickname)
    )
    users = list(rows.scalars().all())
    out: list[UserPublic] = []
    for u in users:
        roles = await auth_service.get_user_roles(db, u.id)
        out.append(
            UserPublic(
                id=u.id,
                nickname=u.nickname,
                avatar_url=u.avatar_url,
                title=u.title,
                bio=u.bio,
                is_active=u.is_active,
                last_seen_at=u.last_seen_at,
                created_at=u.created_at,
                roles=[RoleRead.model_validate(r) for r in roles],
                total_posts=u.total_posts,
                total_reactions_received=u.total_reactions_received,
                granted_perks=list(u.granted_perks or []),
                birthday=u.birthday.isoformat() if u.birthday else None,
                nick_color=u.nick_color,
                avatar_glow_color=u.avatar_glow_color,
            )
        )
    return out


@router.get("/recent-visitors", response_model=list[UserPublic])
async def recent_visitors(db: DbSession, hours: int = Query(24, ge=1, le=168)) -> list[UserPublic]:
    """Users seen within the last N hours, regardless of online-now status."""
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    rows = await db.execute(
        select(User)
        .where(
            User.is_active.is_(True),
            User.last_seen_at.is_not(None),
            User.last_seen_at >= cutoff,
        )
        .order_by(desc(User.last_seen_at))
        .limit(50)
    )
    users = list(rows.scalars().all())
    out: list[UserPublic] = []
    for u in users:
        roles = await auth_service.get_user_roles(db, u.id)
        out.append(
            UserPublic(
                id=u.id,
                nickname=u.nickname,
                avatar_url=u.avatar_url,
                title=u.title,
                bio=u.bio,
                is_active=u.is_active,
                last_seen_at=u.last_seen_at,
                created_at=u.created_at,
                roles=[RoleRead.model_validate(r) for r in roles],
                total_posts=u.total_posts,
                total_reactions_received=u.total_reactions_received,
                granted_perks=list(u.granted_perks or []),
                birthday=u.birthday.isoformat() if u.birthday else None,
                nick_color=u.nick_color,
                avatar_glow_color=u.avatar_glow_color,
            )
        )
    return out


@router.get("/{nickname}/threads", response_model=list[ThreadRead])
async def list_user_threads(
    nickname: str,
    db: DbSession,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[ThreadRead]:
    """Threads created by this user, newest first."""
    from app.models.thread import Thread

    user_q = await db.execute(select(User).where(User.nickname == nickname))
    u = user_q.scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    rows = await db.execute(
        select(Thread)
        .where(Thread.author_id == u.id, Thread.is_deleted.is_(False))
        .order_by(desc(Thread.created_at))
        .limit(limit)
        .offset(offset)
    )
    threads = list(rows.scalars().all())

    roles = await auth_service.get_user_roles(db, u.id)
    author = UserPublic(
        id=u.id,
        nickname=u.nickname,
        avatar_url=u.avatar_url,
        title=u.title,
        bio=u.bio,
        is_active=u.is_active,
        last_seen_at=u.last_seen_at,
        created_at=u.created_at,
        roles=[RoleRead.model_validate(r) for r in roles],
        total_posts=u.total_posts,
        total_reactions_received=u.total_reactions_received,
        granted_perks=list(u.granted_perks or []),
        birthday=u.birthday.isoformat() if u.birthday else None,
        nick_color=u.nick_color,
        avatar_glow_color=u.avatar_glow_color,
    )
    return [
        ThreadRead(
            id=t.id,
            section_id=t.section_id,
            title=t.title,
            slug=t.slug,
            is_pinned=t.is_pinned,
            is_locked=t.is_locked,
            view_count=t.view_count,
            reply_count=t.reply_count,
            last_post_at=t.last_post_at,
            created_at=t.created_at,
            author=author,
            last_post_author=None,
        )
        for t in threads
    ]


@router.get("/{nickname}/posts", response_model=list[PostRead])
async def list_user_posts(
    nickname: str,
    db: DbSession,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[PostRead]:
    """Recent (non-OP) posts by this user, newest first."""
    from sqlalchemy import func as _func

    from app.models.thread import Post, Reaction

    user_q = await db.execute(select(User).where(User.nickname == nickname))
    u = user_q.scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    rows = await db.execute(
        select(Post)
        .where(Post.author_id == u.id, Post.is_deleted.is_(False))
        .order_by(desc(Post.created_at))
        .limit(limit)
        .offset(offset)
    )
    posts = list(rows.scalars().all())

    if not posts:
        return []

    post_ids = [p.id for p in posts]
    cnt_rows = await db.execute(
        select(Reaction.post_id, _func.count())
        .where(Reaction.post_id.in_(post_ids))
        .group_by(Reaction.post_id)
    )
    counts = {pid: int(c) for pid, c in cnt_rows.all()}

    # Fetch thread titles for these posts (single query)
    from app.models.thread import Thread

    thread_ids = list({p.thread_id for p in posts})
    titles_rows = await db.execute(select(Thread.id, Thread.title).where(Thread.id.in_(thread_ids)))
    thread_titles = {tid: title for tid, title in titles_rows.all()}

    roles = await auth_service.get_user_roles(db, u.id)
    author = UserPublic(
        id=u.id,
        nickname=u.nickname,
        avatar_url=u.avatar_url,
        title=u.title,
        bio=u.bio,
        is_active=u.is_active,
        last_seen_at=u.last_seen_at,
        created_at=u.created_at,
        roles=[RoleRead.model_validate(r) for r in roles],
        total_posts=u.total_posts,
        total_reactions_received=u.total_reactions_received,
        granted_perks=list(u.granted_perks or []),
        birthday=u.birthday.isoformat() if u.birthday else None,
        nick_color=u.nick_color,
        avatar_glow_color=u.avatar_glow_color,
    )
    return [
        PostRead(
            id=p.id,
            thread_id=p.thread_id,
            thread_title=thread_titles.get(p.thread_id),
            body=p.body,
            is_first=p.is_first,
            parent_post_id=p.parent_post_id,
            edited_at=p.edited_at,
            created_at=p.created_at,
            author=author,
            reaction_count=counts.get(p.id, 0),
            has_reacted=False,
        )
        for p in posts
    ]


@router.get("/{nickname}/activity")
async def get_user_activity(
    nickname: str,
    db: DbSession,
    days: int = Query(90, ge=7, le=365),
) -> dict:
    """Per-day post + reaction activity for the user, last `days` days.
    Used to render a GitHub-style heatmap on the profile.
    """
    user_q = await db.execute(select(User).where(User.nickname == nickname))
    u = user_q.scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    sql = text(
        """
        WITH days AS (
            SELECT generate_series(
                date_trunc('day', NOW() - (:days || ' days')::interval),
                date_trunc('day', NOW()),
                '1 day'::interval
            )::date AS day
        ),
        posts_per_day AS (
            SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS cnt
            FROM posts
            WHERE author_id = :user_id
              AND NOT is_deleted
              AND created_at >= NOW() - (:days || ' days')::interval
            GROUP BY 1
        ),
        reactions_per_day AS (
            SELECT date_trunc('day', r.created_at)::date AS day, COUNT(*)::int AS cnt
            FROM reactions r
            JOIN posts p ON p.id = r.post_id
            WHERE p.author_id = :user_id
              AND r.created_at >= NOW() - (:days || ' days')::interval
            GROUP BY 1
        )
        SELECT
            d.day,
            COALESCE(p.cnt, 0) AS posts,
            COALESCE(r.cnt, 0) AS reactions
        FROM days d
        LEFT JOIN posts_per_day p ON p.day = d.day
        LEFT JOIN reactions_per_day r ON r.day = d.day
        ORDER BY d.day
        """
    )
    rows = (
        await db.execute(sql, {"user_id": u.id, "days": str(days)})
    ).mappings().all()
    return {
        "days": [
            {
                "date": row["day"].isoformat(),
                "posts": int(row["posts"]),
                "reactions": int(row["reactions"]),
            }
            for row in rows
        ],
        "total_days": days,
    }


@router.get("/{nickname}", response_model=UserPublic)
async def get_user(nickname: str, db: DbSession) -> UserPublic:
    result = await db.execute(select(User).where(User.nickname == nickname))
    u = result.scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    roles = await auth_service.get_user_roles(db, u.id)
    return UserPublic(
        id=u.id,
        nickname=u.nickname,
        avatar_url=u.avatar_url,
        title=u.title,
        bio=u.bio,
        is_active=u.is_active,
        last_seen_at=u.last_seen_at,
        created_at=u.created_at,
        roles=[RoleRead.model_validate(r) for r in roles],
        total_posts=u.total_posts,
        total_reactions_received=u.total_reactions_received,
        granted_perks=list(u.granted_perks or []),
        birthday=u.birthday.isoformat() if u.birthday else None,
        nick_color=u.nick_color,
        avatar_glow_color=u.avatar_glow_color,
    )
