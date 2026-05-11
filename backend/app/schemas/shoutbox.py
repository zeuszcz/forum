from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserPublic


class ShoutboxReplyPreview(BaseModel):
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
    kind: str = "user"
    meta: dict[str, Any] | None = None
    author: UserPublic | None = None
    reply_to: ShoutboxReplyPreview | None = None
    reactions: dict[str, int] = Field(default_factory=dict)
    reacted: list[str] = Field(default_factory=list)
    # Map-vote state — counts per option_idx and the caller's pick (if any).
    vote_counts: dict[int, int] = Field(default_factory=dict)
    my_vote: int | None = None


class ShoutboxCreate(BaseModel):
    body: str = Field(min_length=1, max_length=500)
    reply_to_id: int | None = None


class ShoutboxUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class SystemMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=500)
    tag: str | None = Field(default=None, max_length=24)
    category: str | None = Field(default=None, max_length=24)
    # ephemeral=True → broadcast over WS only, do not persist to
    # shoutbox_messages. Used for high-frequency feeds (in-game chat)
    # where keeping every line in Postgres would be wasteful.
    ephemeral: bool = False


class MapVoteCreate(BaseModel):
    question: str = Field(default="Map vote", max_length=120)
    options: list[str] = Field(min_length=2, max_length=5)
    duration_min: int = Field(default=3, ge=1, le=30)


class VoteRequest(BaseModel):
    option_idx: int = Field(ge=0, le=4)


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


class ServerStatus(BaseModel):
    """Snapshot returned by GET /shoutbox/server-status. Cached server-side ~5s."""

    address: str
    name: str
    map: str | None = None
    players: int = 0
    max_players: int = 32
    online: bool = False
    ping_ms: int | None = None
    score_ct: int | None = None
    score_t: int | None = None
