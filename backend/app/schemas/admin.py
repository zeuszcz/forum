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
    granted_perks: list[str] = []

    # Quest/case economy — visible in admin panel for inspection / grants
    case_keys: int = 0
    bonus_xp: int = 0


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


class PerksUpdate(BaseModel):
    """Replace user's granted_perks with this list. Whitelist enforced server-side."""
    perks: list[str] = Field(default_factory=list)


class KeysGrantRequest(BaseModel):
    """Grant N case keys to a user. Negative = revoke."""
    amount: int = Field(ge=-100, le=100)
    reason: str | None = Field(default=None, max_length=120)


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


class RoleAdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    title: str
    color: str
    display_order: int
    is_staff: bool
    member_count: int = 0

    # Granular permissions
    can_ban: bool = False
    can_mute: bool = False
    can_manage_threads: bool = False
    can_manage_users: bool = False
    can_manage_roles: bool = False
    can_grant_perks: bool = False
    can_view_audit: bool = False


class RoleCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=32, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    title: str = Field(min_length=1, max_length=64)
    color: str = Field(default="#7c5cff", pattern=r"^#[0-9a-fA-F]{6}$")
    display_order: int = Field(default=100, ge=0, le=9999)
    is_staff: bool = False
    can_ban: bool = False
    can_mute: bool = False
    can_manage_threads: bool = False
    can_manage_users: bool = False
    can_manage_roles: bool = False
    can_grant_perks: bool = False
    can_view_audit: bool = False


class RoleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    display_order: int | None = Field(default=None, ge=0, le=9999)
    is_staff: bool | None = None
    can_ban: bool | None = None
    can_mute: bool | None = None
    can_manage_threads: bool | None = None
    can_manage_users: bool | None = None
    can_manage_roles: bool | None = None
    can_grant_perks: bool | None = None
    can_view_audit: bool | None = None
