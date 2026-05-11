from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RconCommand(BaseModel):
    command: str = Field(min_length=1, max_length=500)


class RconBatch(BaseModel):
    """Up to 10 commands fired sequentially as one batch. Total time-budget
    governed by the same rate limit as a single execute (counts as N
    requests against the 5/10s window)."""

    commands: list[str] = Field(min_length=1, max_length=10)


class RconResult(BaseModel):
    ok: bool
    command: str
    response: str
    latency_ms: int


class RconLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    command: str
    response: str | None = None
    success: bool
    error: str | None = None
    latency_ms: int | None = None
    created_at: datetime
    actor_id: int | None = None
    actor_nickname: str | None = None
