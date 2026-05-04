from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserPublic


class SectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None = None
    slug: str
    title: str
    description: str
    icon: str
    accent: str
    display_order: int
    is_locked: bool
    thread_count: int
    post_count: int
    last_thread_id: int | None = None
    # Populated by /sections endpoint when fetching the index — top-level
    # sections carry their direct children here for grouped rendering.
    children: list["SectionRead"] = []


class ThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    section_id: int
    title: str
    slug: str
    is_pinned: bool
    is_locked: bool
    view_count: int
    reply_count: int
    last_post_at: datetime | None = None
    created_at: datetime
    author: UserPublic | None = None
    last_post_author: UserPublic | None = None


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    thread_title: str | None = None
    body: str
    is_first: bool
    parent_post_id: int | None = None
    edited_at: datetime | None = None
    edited_by: UserPublic | None = None
    created_at: datetime
    author: UserPublic | None = None
    reaction_count: int = 0
    has_reacted: bool = False
    reactions_by_kind: dict[str, int] = {}
    my_reaction_kinds: list[str] = []
    # Nicknames of users who reacted with kind='thanks' — small list shown
    # under each post as a "Сказали спасибо" line.
    thanked_by: list[str] = []


class ThreadCreate(BaseModel):
    title: str = Field(min_length=4, max_length=200)
    body: str = Field(min_length=4, max_length=20000)


class PostCreate(BaseModel):
    body: str = Field(min_length=1, max_length=20000)
    parent_post_id: int | None = None


class PostUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=20000)


class ThreadWithPostsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    thread: ThreadRead
    posts: list[PostRead]
    section: SectionRead
    total_posts: int
