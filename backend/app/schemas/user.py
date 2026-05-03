from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
