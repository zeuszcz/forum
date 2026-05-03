from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    title: str
    color: str
    is_staff: bool


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nickname: str
    avatar_url: str | None = None
    title: str | None = None
    bio: str | None = None
    is_active: bool
    last_seen_at: datetime | None = None
    created_at: datetime
    roles: list[RoleRead] = []

    # Cached stats — used by frontend to compute level + rank locally
    total_posts: int = 0
    total_reactions_received: int = 0

    # Manually-granted perks that bypass level requirements
    granted_perks: list[str] = []

    # ISO date string YYYY-MM-DD if user has set their birthday
    birthday: str | None = None

    # Custom hex colors set by the user (gated by perks)
    # nick_color overrides top-role color when rendering nicknames
    # avatar_glow_color tints the avatar ring/halo
    nick_color: str | None = None
    avatar_glow_color: str | None = None


class UserProfileUpdate(BaseModel):
    """Self-update of own profile.
    bio + birthday are always editable;
    title requires level >= 25 (custom-title perk) — enforced in router;
    signature requires level >= 5;
    nick_color requires glow_nick perk;
    avatar_glow_color requires animated_frame perk.
    """
    bio: str | None = Field(default=None, max_length=1024)
    title: str | None = Field(default=None, max_length=80)
    signature: str | None = Field(default=None, max_length=1024)
    # Accept "YYYY-MM-DD" or empty string to clear; validated in router
    birthday: str | None = Field(default=None)
    # Hex colors "#RRGGBB" or "#RRGGBBAA" — empty string clears, None = no change
    nick_color: str | None = Field(default=None, max_length=9)
    avatar_glow_color: str | None = Field(default=None, max_length=9)
