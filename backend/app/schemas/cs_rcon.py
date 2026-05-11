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


class ActionRequest(BaseModel):
    """One forum-driven «click» — runs a jbf_uaio command, optionally
    posts a `say` announcement, and updates the active-effects state."""

    command: str = Field(min_length=1, max_length=500)
    announce: str | None = Field(default=None, max_length=200)
    # AMX color tag — used for amx_tsay (top-left HUD coloured banner).
    # Acceptable: red / green / yellow / blue / white / grey. Backend
    # validates against an allow-list; unknown / null → green.
    announce_color: str | None = Field(default=None, max_length=16)
    # If set, the effect goes into cs_active_effects (grant or revoke).
    effect_slug: str | None = Field(default=None, max_length=64)
    effect_label: str | None = Field(default=None, max_length=128)
    effect_emoji: str | None = Field(default=None, max_length=8)
    target_steamid: str | None = Field(default=None, max_length=64)
    target_nick: str | None = Field(default=None, max_length=64)
    # "grant" (default for new) or "revoke" (deletes the row).
    state: str | None = Field(default=None, pattern="^(grant|revoke)$")
    # If grant and -t N was used, pass N here so we know when it expires.
    duration_s: int | None = Field(default=None, ge=0, le=86400)


class ActionResult(BaseModel):
    ok: bool
    command: str
    response: str
    announce_sent: bool
    effect_state: str | None = None  # 'granted' / 'revoked' / null
    latency_ms: int


class ActiveEffectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    steamid: str
    effect_slug: str
    effect_label: str
    effect_emoji: str | None = None
    granted_by_id: int | None = None
    granted_by_nickname: str | None = None
    granted_at: datetime
    expires_at: datetime | None = None
    player_nick: str | None = None


class CsPlayer(BaseModel):
    slot: int
    name: str
    userid: int
    steamid: str
    frag: int
    time: str
    ping: int
    loss: int
    addr: str


class CsPlayersResponse(BaseModel):
    players: list[CsPlayer]
    map: str | None = None
    online: int = 0
    max_players: int | None = None


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
