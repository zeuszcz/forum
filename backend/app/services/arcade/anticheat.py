"""arcade — server-side anti-cheat gate.

We trust client-side simulation but validate three invariants at end_run:

1. **Rate limit.** A user can submit at most N runs per minute. Anything
   beyond that is flagged spam.
2. **Sanity curve.** Final score / duration must fit the game's
   `max_score_per_second`. A single 200ms run claiming 50_000 score is
   impossible.
3. **Score ceiling.** Hard upper bound. Above the ceiling we never
   accept — almost certainly a bug or cheat.

Failed runs are written with `status='flagged'` + a reason, so admins
can audit. They do **not** appear in leaderboards.

A future v2 can add replay validation by re-running the client log
through a server-side simulator. For v1 these three gates are enough
to keep the public leaderboard honest.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.arcade import ArcadeRun
from app.services.arcade.games import GameConfig


RATE_LIMIT_RUNS_PER_MINUTE = 6


@dataclass(frozen=True)
class Verdict:
    ok: bool
    reason: str | None
    capped_score: int


async def check_submission(
    db: AsyncSession,
    *,
    game: GameConfig,
    user_id: int,
    score: int,
    duration_ms: int,
) -> Verdict:
    """Apply the three gates. Returns a Verdict; caller decides what to do."""
    if score < 0:
        return Verdict(False, "negative_score", 0)
    if score > game.score_ceiling:
        return Verdict(False, "score_ceiling", game.score_ceiling)
    if duration_ms < game.min_duration_ms:
        return Verdict(False, "too_short", 0)

    duration_seconds = max(1.0, duration_ms / 1000.0)
    rate = score / duration_seconds
    if rate > game.max_score_per_second:
        return Verdict(False, f"rate_too_high:{rate:.1f}", 0)

    # Rate-limit — count submissions in the last 60s.
    one_minute_ago = datetime.now(UTC) - timedelta(seconds=60)
    recent = (await db.execute(
        select(func.count()).select_from(ArcadeRun).where(
            ArcadeRun.user_id == user_id,
            ArcadeRun.ended_at.is_not(None),
            ArcadeRun.ended_at >= one_minute_ago,
        )
    )).scalar() or 0
    if recent >= RATE_LIMIT_RUNS_PER_MINUTE:
        return Verdict(False, "rate_limited", score)

    return Verdict(True, None, score)
