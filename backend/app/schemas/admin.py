from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import RoleRead


class AdminUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nickname: str
    email: str | None = None
    avatar_url: str | None = None
    title: str | None = None
    is_active: bool
    is_verified: bool
    last_seen_at: datetime | None = None
    created_at: datetime

    is_banned: bool
    ban_reason: str | None = None
    banned_until: datetime | None = None

    is_muted: bool
    mute_reason: str | None = None
    muted_until: datetime | None = None

    can_create_threads: bool

    roles: list[RoleRead] = []


class AdminUsersResponse(BaseModel):
    users: list[AdminUserRead]
    total: int
    limit: int
    offset: int


class BanRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
    duration_hours: int | None = Field(default=None, ge=1, le=24 * 365)


class MuteRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
    duration_hours: int | None = Field(default=None, ge=1, le=24 * 365)


class ThreadLockRequest(BaseModel):
    locked: bool


class ThreadCreationRequest(BaseModel):
    can_create: bool
    reason: str | None = Field(default=None, max_length=500)


class DeletePostRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ModerationLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    reason: str | None = None
    expires_at: datetime | None = None
    created_at: datetime
    actor_id: int | None = None
    target_user_id: int | None = None
    target_post_id: int | None = None
    target_thread_id: int | None = None
    target_section_id: int | None = None


class AdminStats(BaseModel):
    users_total: int
    users_banned: int
    users_muted: int
    threads_total: int
    posts_total: int
    sections_locked: int
