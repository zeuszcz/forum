"""arcade — monthly leaderboard rollover.

Strategy:
  * Day 1 of each month (idempotent) we freeze last month's top-10 of
    every game into `arcade_monthly_winner`.
  * Top-3 get explicit payouts:
        1st  +2000 karma + 5 case_keys + temp title "Король <game>"
        2nd  +1000 karma + 3 case_keys
        3rd  +500  karma + 1 case_key
        4-10 +100  karma (participation)
  * Title is written to `user.title`. We do NOT reset the title at
    next rollover — winners keep their badge until the title is
    overwritten by the next month's #1.
  * Idempotency via UNIQUE (year_month, game_slug, rank). If the
    freeze runs twice for the same month, the second pass is a no-op.

Run via:
  * POST /api/admin/arcade/finalise-month (manual)
  * cron task hits the same endpoint with an admin token at 00:05 on
    the 1st of every month
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.arcade import ArcadeMonthlyWinner
from app.models.user import User
from app.services.arcade.arcade_service import leaderboard_month
from app.services.arcade.games import all_games


PAYOUTS_KARMA = {1: 2000, 2: 1000, 3: 500}
PAYOUTS_KEYS = {1: 5, 2: 3, 3: 1}
PARTICIPATION_KARMA = 100
PARTICIPATION_RANKS = list(range(4, 11))  # 4..10 inclusive


@dataclass(frozen=True)
class FreezeReport:
    year_month: str
    rows_written: int
    karma_credited: int
    keys_credited: int
    titles_granted: int
    skipped_already_frozen: bool


def previous_year_month_str(now: datetime | None = None) -> str:
    """YYYY-MM for the calendar month BEFORE `now` (UTC)."""
    n = now or datetime.now(UTC)
    first_of_this = datetime(n.year, n.month, 1, tzinfo=UTC)
    last_of_prev = first_of_this - timedelta(days=1)
    return last_of_prev.strftime("%Y-%m")


async def already_frozen(
    db: AsyncSession,
    year_month: str,
) -> bool:
    found = (await db.execute(
        select(ArcadeMonthlyWinner.id).where(
            ArcadeMonthlyWinner.year_month == year_month,
        ).limit(1)
    )).scalar_one_or_none()
    return found is not None


async def freeze_month(
    db: AsyncSession,
    year_month: str | None = None,
) -> FreezeReport:
    """Snapshot top-10 of every game for `year_month`. Idempotent."""
    ym = year_month or previous_year_month_str()
    if await already_frozen(db, ym):
        return FreezeReport(
            year_month=ym,
            rows_written=0,
            karma_credited=0,
            keys_credited=0,
            titles_granted=0,
            skipped_already_frozen=True,
        )

    total_rows = 0
    total_karma = 0
    total_keys = 0
    total_titles = 0

    for game in all_games():
        board = await leaderboard_month(
            db, game_slug=game.slug, year_month=ym, limit=10,
        )
        for entry in board:
            user = (await db.execute(
                select(User).where(User.id == entry.user_id)
            )).scalar_one_or_none()
            if user is None:
                continue
            karma = PAYOUTS_KARMA.get(entry.rank, 0)
            keys = PAYOUTS_KEYS.get(entry.rank, 0)
            title_grant: str | None = None
            if entry.rank in PARTICIPATION_RANKS:
                karma = PARTICIPATION_KARMA
            if entry.rank == 1:
                title_grant = f"Король «{game.title}»"
                # Write title on the user, overwriting whatever was there.
                user.title = title_grant
                total_titles += 1
            row = ArcadeMonthlyWinner(
                year_month=ym,
                game_slug=game.slug,
                rank=entry.rank,
                user_id=entry.user_id,
                score=entry.score,
                payout_karma=karma,
                payout_keys=keys,
                title_grant=title_grant,
            )
            db.add(row)
            try:
                await db.flush()
            except IntegrityError:
                await db.rollback()
                continue
            # Credit currencies on the user.
            user.karma = (user.karma or 0) + karma
            user.case_keys = (user.case_keys or 0) + keys
            total_rows += 1
            total_karma += karma
            total_keys += keys

    return FreezeReport(
        year_month=ym,
        rows_written=total_rows,
        karma_credited=total_karma,
        keys_credited=total_keys,
        titles_granted=total_titles,
        skipped_already_frozen=False,
    )
