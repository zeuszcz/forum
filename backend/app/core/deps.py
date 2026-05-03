from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from sqlalchemy import select


COOKIE_NAME = "ew_session"


async def _resolve_user(token: str | None, db: AsyncSession) -> User | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") not in {"access", "refresh"}:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_optional_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    session_cookie: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> User | None:
    """Returns the authenticated user if a valid token is present, else None."""
    token = session_cookie
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    return await _resolve_user(token, db)


async def get_current_user(
    user: Annotated[User | None, Depends(get_optional_user)],
) -> User:
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated["User | None", Depends(get_optional_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]


def require_permission(permission: str):
    """FastAPI dependency that requires the current user to have at least one
    role granting the given permission flag (Role.can_*).

    Usage:
        actor: Annotated[User, Depends(require_permission("can_ban"))]
    """

    async def _dep(
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> User:
        # Lazy import to avoid circular
        from app.services import auth as auth_service

        roles = await auth_service.get_user_roles(db, user.id)
        if not any(getattr(r, permission, False) for r in roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Нет права: {permission}",
            )
        return user

    return _dep
