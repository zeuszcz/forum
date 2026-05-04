from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DbSession
from app.models.shoutbox import ShoutboxMessage
from app.models.user import User
from app.schemas.shoutbox import ShoutboxCreate, ShoutboxRead
from app.schemas.user import RoleRead, UserPublic
from app.services import auth as auth_service
from app.services import shoutbox as shoutbox_service

router = APIRouter(prefix="/shoutbox", tags=["shoutbox"])

# Simple in-process flood control: 1 message per 3 seconds per user
_FLOOD_WINDOW = timedelta(seconds=3)


async def _user_to_public(db: AsyncSession, user: User | None) -> UserPublic | None:
    if user is None:
        return None
    roles = await auth_service.get_user_roles(db, user.id)
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
        thanks_received=user.thanks_received,
        granted_perks=list(user.granted_perks or []),
        birthday=user.birthday.isoformat() if user.birthday else None,
        steam_id=user.steam_id,
        bonus_xp=user.bonus_xp,
        case_keys=user.case_keys,
        nick_color=user.nick_color,
        avatar_glow_color=user.avatar_glow_color,
    )


@router.get("", response_model=list[ShoutboxRead])
async def list_messages(db: DbSession, limit: int = 50) -> list[ShoutboxRead]:
    rows = await shoutbox_service.list_recent(db, limit=min(limit, 100))
    user_ids = {m.author_id for m in rows if m.author_id}
    users: dict[int, User] = {}
    if user_ids:
        ures = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u for u in ures.scalars().all()}
    out: list[ShoutboxRead] = []
    for m in rows:
        author = users.get(m.author_id) if m.author_id else None
        out.append(
            ShoutboxRead(
                id=m.id,
                body=m.body,
                created_at=m.created_at,
                author=await _user_to_public(db, author) if author else None,
            )
        )
    return out


@router.post("", response_model=ShoutboxRead, status_code=status.HTTP_201_CREATED)
async def post_message(
    payload: ShoutboxCreate, user: CurrentUser, db: DbSession
) -> ShoutboxRead:
    # flood check — last own message
    last_q = await db.execute(
        select(ShoutboxMessage)
        .where(ShoutboxMessage.author_id == user.id)
        .order_by(desc(ShoutboxMessage.created_at))
        .limit(1)
    )
    last = last_q.scalar_one_or_none()
    if last is not None and datetime.now(UTC) - last.created_at < _FLOOD_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком быстро. Подожди пару секунд.",
        )

    msg = await shoutbox_service.post(db, author=user, payload=payload)
    return ShoutboxRead(
        id=msg.id,
        body=msg.body,
        created_at=msg.created_at,
        author=await _user_to_public(db, user),
    )
