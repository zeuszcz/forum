from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    title: str
    color: str
    is_staff: bool
    # Optional affiliation suffix (e.g. "JB", "PUB") rendered as
    # "{title} ► {affiliation_tag}" in role badges across the site.
    affiliation_tag: str | None = None


class PerkGrantOut(BaseModel):
    """Active perk grant — either permanent (expires_at=None) or time-bounded."""
    slug: str
    expires_at: str | None = None
    source: str | None = None


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nickname: str
    avatar_url: str | None = None
    profile_banner_url: str | None = None
    title: str | None = None
    bio: str | None = None
    is_active: bool
    last_seen_at: datetime | None = None
    created_at: datetime
    roles: list[RoleRead] = []

    # Cached stats — used by frontend to compute level + rank locally
    total_posts: int = 0
    total_reactions_received: int = 0
    # Subset of total_reactions_received counting only kind='thanks' — shown
    # as a separate reputation metric in profile/post sidebars.
    thanks_received: int = 0

    # Effective perks — union of permanent (users.granted_perks) + active
    # time-bounded grants from user_perk_grants.
    granted_perks: list[str] = []
    # Structured grants list with expiration metadata for countdowns
    perk_grants: list[PerkGrantOut] = []

    # ISO date string YYYY-MM-DD if user has set their birthday
    birthday: str | None = None
    # 17-digit steamid64 if the user has linked their Steam account
    steam_id: str | None = None

    # Quest/case rewards economy
    bonus_xp: int = 0
    case_keys: int = 0

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
    # Image URLs — empty string clears, None = no change. Must come from our
    # /attachments endpoint (validated in router).
    avatar_url: str | None = Field(default=None, max_length=512)
    profile_banner_url: str | None = Field(default=None, max_length=512)
