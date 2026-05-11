from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserPublic


class ShoutboxReplyPreview(BaseModel):
    """Lightweight snapshot of the message being replied to. Body is truncated
    to keep payload small; clients still link to the full message by id."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    author_nickname: str | None = None
    is_deleted: bool = False


class ShoutboxRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    created_at: datetime
    edited_at: datetime | None = None
    is_pinned: bool = False
    is_deleted: bool = False
    author: UserPublic | None = None
    reply_to: ShoutboxReplyPreview | None = None
    reactions: dict[str, int] = Field(default_factory=dict)
    reacted: list[str] = Field(default_factory=list)


class ShoutboxCreate(BaseModel):
    body: str = Field(min_length=1, max_length=500)
    reply_to_id: int | None = None


class ShoutboxUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class ChatMuteCreate(BaseModel):
    user_id: int
    duration_min: int = Field(ge=1, le=60 * 24 * 30)
    reason: str | None = Field(default=None, max_length=256)


class ChatMuteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    until: datetime
    reason: str | None = None
    created_by_id: int | None = None


class ReactionToggleResult(BaseModel):
    id: int
    reactions: dict[str, int]
    reacted: list[str]
