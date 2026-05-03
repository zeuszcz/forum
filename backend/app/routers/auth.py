from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.config import settings
from app.core.deps import COOKIE_NAME, CurrentUser, DbSession
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.schemas.user import RoleRead, UserPublic
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )


async def _serialize_user(db, user) -> UserPublic:
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
    )


@router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest, response: Response, db: DbSession) -> AuthResponse:
    user, token = await auth_service.register_user(db, payload)
    _set_session_cookie(response, token)
    return AuthResponse(user=await _serialize_user(db, user), access_token=token)


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response, db: DbSession) -> AuthResponse:
    user, token = await auth_service.login_user(db, payload)
    _set_session_cookie(response, token)
    return AuthResponse(user=await _serialize_user(db, user), access_token=token)


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "ok"}


@router.get("/me", response_model=UserPublic)
async def me(user: CurrentUser, db: DbSession) -> UserPublic:
    return await _serialize_user(db, user)
