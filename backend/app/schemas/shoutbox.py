from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserPublic


class ShoutboxRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    created_at: datetime
    edited_at: datetime | None = None
    is_pinned: bool = False
    is_deleted: bool = False
    author: UserPublic | None = None


class ShoutboxCreate(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class ShoutboxUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class ChatMuteCreate(BaseModel):
    user_id: int
    duration_min: int = Field(ge=1, le=60 * 24 * 30)  # 1 min .. 30 days
    reason: str | None = Field(default=None, max_length=256)


class ChatMuteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    until: datetime
    reason: str | None = None
    created_by_id: int | None = None
