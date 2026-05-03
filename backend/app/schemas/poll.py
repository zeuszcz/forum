from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PollOptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    display_order: int
    vote_count: int = 0


class PollRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    question: str
    multi: bool
    closed: bool
    total_votes: int = 0
    options: list[PollOptionRead] = []
    my_votes: list[int] = []  # option_ids the current user has voted for


class PollOptionCreate(BaseModel):
    text: str = Field(min_length=1, max_length=120)


class PollCreate(BaseModel):
    question: str = Field(min_length=4, max_length=280)
    multi: bool = False
    options: list[PollOptionCreate] = Field(min_length=2, max_length=10)


class PollVoteRequest(BaseModel):
    option_ids: list[int] = Field(min_length=1, max_length=10)
