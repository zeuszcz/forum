from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_token, hash_password, verify_password
from app.models.role import Role, UserRole
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest


async def register_user(db: AsyncSession, payload: RegisterRequest) -> tuple[User, str]:
    # uniqueness
    existing = await db.execute(
        select(User).where((User.email == payload.email) | (User.nickname == payload.nickname))
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Никнейм или email уже заняты",
        )

    user = User(
        nickname=payload.nickname,
        email=payload.email,
        password_hash=hash_password(payload.password),
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Никнейм или email уже заняты"
        ) from exc

    # First registered user → admin
    total_q = await db.execute(select(func.count()).select_from(User))
    total = total_q.scalar_one()
    if total == 1:
        admin_role_q = await db.execute(select(Role).where(Role.slug == "admin"))
        admin_role = admin_role_q.scalar_one_or_none()
        if admin_role is not None:
            db.add(UserRole(user_id=user.id, role_id=admin_role.id))

    # Default member role
    member_role_q = await db.execute(select(Role).where(Role.slug == "member"))
    member_role = member_role_q.scalar_one_or_none()
    if member_role is not None:
        db.add(UserRole(user_id=user.id, role_id=member_role.id))

    await db.commit()
    await db.refresh(user)

    token = create_token(str(user.id), token_type="refresh")
    return user, token


async def login_user(db: AsyncSession, payload: LoginRequest) -> tuple[User, str]:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт заблокирован",
        )
    # Block banned users from logging in
    from app.services.admin import is_currently_banned

    if is_currently_banned(user):
        msg = "Ты забанен"
        if user.ban_reason:
            msg += f": {user.ban_reason}"
        if user.banned_until:
            msg += f" (до {user.banned_until.strftime('%d.%m.%Y %H:%M UTC')})"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)
    token = create_token(str(user.id), token_type="refresh")
    return user, token


async def get_user_roles(db: AsyncSession, user_id: int) -> list[Role]:
    result = await db.execute(
        select(Role).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user_id)
    )
    return list(result.scalars().all())
