from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import desc, select

from app.core.deps import CurrentUser, DbSession
from app.models.user import User
from app.schemas.user import RoleRead, UserPublic
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
            )
        )
    return out


@router.post("/heartbeat")
async def heartbeat(user: CurrentUser, db: DbSession) -> dict[str, str]:
    user.last_seen_at = datetime.now(UTC)
    await db.commit()
    return {"status": "ok"}


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
    )
