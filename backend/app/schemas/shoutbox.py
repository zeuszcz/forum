from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserPublic


class ShoutboxRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    created_at: datetime
    author: UserPublic | None = None


class ShoutboxCreate(BaseModel):
    body: str = Field(min_length=1, max_length=280)
