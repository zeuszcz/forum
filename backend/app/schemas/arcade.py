"""Pydantic schemas for the arcade router."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class GameOut(BaseModel):
    slug: str
    title: str
    short: str
    emoji: str
    accent: str
    description: str
    controls: str
    score_unit: str
    max_score_per_second: float
    min_duration_ms: int
    score_ceiling: int


class StartRunRequest(BaseModel):
    client_version: str = Field(default="v0", max_length=20)


class StartRunOut(BaseModel):
    run_id: int
    seed: int
    started_at: datetime
    client_version: str


class EndRunRequest(BaseModel):
    run_id: int = Field(ge=1)
    score: int = Field(ge=0)
    duration_ms: int = Field(ge=0)
    replay: dict[str, Any] = Field(default_factory=dict)


class EndRunResult(BaseModel):
    ok: bool
    accepted: bool
    reason: str | None = None
    score: int
    rank_in_month: int | None = None
    rank_all_time: int | None = None


class LeaderEntryOut(BaseModel):
    rank: int
    user_id: int
    user_nickname: str
    user_title: str | None = None
    user_avatar_url: str | None = None
    score: int
    ended_at: datetime
    run_id: int


class MyGameStatOut(BaseModel):
    game_slug: str
    best_score: int
    runs_count: int
    last_played: datetime | None = None
    rank_month: int | None = None
    rank_all_time: int | None = None


class HallOfFameRowOut(BaseModel):
    rank: int
    user_id: int
    user_nickname: str
    user_avatar_url: str | None = None
    score: int
    payout_karma: int
    payout_keys: int
    title_grant: str | None = None


class HallOfFameSection(BaseModel):
    year_month: str
    game_slug: str
    entries: list[HallOfFameRowOut] = Field(default_factory=list)


class DailyBonusOut(BaseModel):
    granted: bool
    karma_granted: int
    streak: int
    next_in_seconds: int


class FreezeMonthResult(BaseModel):
    ok: bool
    year_month: str
    rows_written: int
    karma_credited: int
    keys_credited: int
    titles_granted: int
    skipped_already_frozen: bool
