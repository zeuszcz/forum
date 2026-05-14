"""arcade — start/end run, leaderboards, my stats, daily bonus."""
from __future__ import annotations

import secrets
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.arcade import ArcadeDailyBonus, ArcadeMonthlyWinner, ArcadeRun
from app.models.user import User
from app.services.arcade.anticheat import check_submission
from app.services.arcade.games import GameConfig, all_games, get as get_game


@dataclass(frozen=True)
class LeaderEntry:
    rank: int
    user_id: int
    user_nickname: str
    user_title: str | None
    user_avatar_url: str | None
    score: int
    ended_at: datetime
    run_id: int


# ---------------------------------------------------------------------------
# Run lifecycle
# ---------------------------------------------------------------------------


async def start_run(
    db: AsyncSession,
    *,
    user: User,
    game: GameConfig,
    client_version: str = "v0",
) -> ArcadeRun:
    """Open a pending run + return seed. Anti-spam: at most one open run."""
    # Auto-cancel any older pending run from same user/game.
    stale = (await db.execute(
        select(ArcadeRun).where(
            ArcadeRun.user_id == user.id,
            ArcadeRun.game_slug == game.slug,
            ArcadeRun.status == "pending",
        )
    )).scalars().all()
    now = datetime.now(UTC)
    for s in stale:
        s.status = "cancelled"
        s.ended_at = now
        s.flagged_reason = "superseded"

    seed = secrets.randbits(48)
    run = ArcadeRun(
        game_slug=game.slug,
        user_id=user.id,
        seed=seed,
        status="pending",
        client_version=client_version[:20],
    )
    db.add(run)
    await db.flush()
    return run


@dataclass(frozen=True)
class EndOutcome:
    run: ArcadeRun
    accepted: bool
    reason: str | None
    rank_in_month: int | None
    rank_all_time: int | None


async def end_run(
    db: AsyncSession,
    *,
    user: User,
    run_id: int,
    score: int,
    duration_ms: int,
    replay: dict[str, Any],
) -> EndOutcome:
    """Close a run. Apply anti-cheat gate. Return rank info."""
    run = (await db.execute(
        select(ArcadeRun).where(ArcadeRun.id == run_id)
    )).scalar_one_or_none()
    if run is None:
        raise ValueError("run not found")
    if run.user_id != user.id:
        raise PermissionError("not your run")
    if run.status != "pending":
        raise ValueError(f"run already {run.status}")

    game = get_game(run.game_slug)
    if game is None:
        raise ValueError(f"unknown game {run.game_slug!r}")

    verdict = await check_submission(
        db, game=game, user_id=user.id, score=score, duration_ms=duration_ms,
    )

    now = datetime.now(UTC)
    run.ended_at = now
    run.duration_ms = max(0, int(duration_ms))
    run.score = max(0, min(int(score), verdict.capped_score))
    # Trim replay to avoid bloat — keep last 200 inputs + meta.
    safe_replay = _sanitise_replay(replay)
    run.replay = safe_replay

    if verdict.ok:
        run.status = "ended"
    else:
        run.status = "flagged"
        run.flagged_reason = (verdict.reason or "unknown")[:80]

    rank_month = None
    rank_all = None
    if verdict.ok:
        rank_month = await _rank_in_month(db, game.slug, run.user_id, run.score, now)
        rank_all = await _rank_all_time(db, game.slug, run.user_id, run.score)
    return EndOutcome(
        run=run,
        accepted=verdict.ok,
        reason=verdict.reason,
        rank_in_month=rank_month,
        rank_all_time=rank_all,
    )


def _sanitise_replay(replay: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(replay, dict):
        return {}
    out: dict[str, Any] = {}
    # Whitelist known top-level keys.
    for k in ("milestones", "input_log", "meta", "version", "seed"):
        if k in replay:
            v = replay[k]
            if k == "input_log" and isinstance(v, list):
                # Cap list to 1000 entries.
                out[k] = v[-1000:]
            elif k == "milestones" and isinstance(v, list):
                out[k] = v[-200:]
            else:
                out[k] = v
    return out


# ---------------------------------------------------------------------------
# Leaderboards
# ---------------------------------------------------------------------------


async def leaderboard_all_time(
    db: AsyncSession,
    *,
    game_slug: str,
    limit: int = 50,
) -> list[LeaderEntry]:
    rows = await db.execute(
        select(
            ArcadeRun.id,
            ArcadeRun.user_id,
            ArcadeRun.score,
            ArcadeRun.ended_at,
            User.nickname,
            User.title,
            User.avatar_url,
        )
        .join(User, User.id == ArcadeRun.user_id)
        .where(
            ArcadeRun.game_slug == game_slug,
            ArcadeRun.status == "ended",
        )
        .order_by(ArcadeRun.score.desc(), ArcadeRun.ended_at.asc())
        .limit(min(200, limit))
    )
    return _materialise(rows.all())


async def leaderboard_month(
    db: AsyncSession,
    *,
    game_slug: str,
    year_month: str | None = None,
    limit: int = 50,
) -> list[LeaderEntry]:
    """Top-N for a given YYYY-MM (defaults to current month)."""
    if year_month is None:
        ym = datetime.now(UTC).strftime("%Y-%m")
    else:
        ym = year_month
    start = datetime.strptime(ym + "-01", "%Y-%m-%d").replace(tzinfo=UTC)
    # End = first day of next month
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)

    rows = await db.execute(
        select(
            ArcadeRun.id,
            ArcadeRun.user_id,
            ArcadeRun.score,
            ArcadeRun.ended_at,
            User.nickname,
            User.title,
            User.avatar_url,
        )
        .join(User, User.id == ArcadeRun.user_id)
        .where(
            ArcadeRun.game_slug == game_slug,
            ArcadeRun.status == "ended",
            ArcadeRun.ended_at >= start,
            ArcadeRun.ended_at < end,
        )
        .order_by(ArcadeRun.score.desc(), ArcadeRun.ended_at.asc())
        .limit(min(200, limit))
    )
    return _materialise(rows.all())


def _materialise(rows: Sequence[tuple]) -> list[LeaderEntry]:
    """Apply best-per-user dedupe + rank."""
    seen: set[int] = set()
    out: list[LeaderEntry] = []
    rank = 0
    for run_id, uid, score, ended, nick, title, avatar in rows:
        if uid in seen:
            continue
        seen.add(uid)
        rank += 1
        out.append(LeaderEntry(
            rank=rank, user_id=uid, user_nickname=nick,
            user_title=title, user_avatar_url=avatar,
            score=score, ended_at=ended, run_id=run_id,
        ))
    return out


async def _rank_in_month(
    db: AsyncSession,
    game_slug: str,
    user_id: int,
    user_score: int,
    now: datetime,
) -> int:
    """1-based rank of (user, score) in current month (best-per-user)."""
    ym = now.strftime("%Y-%m")
    board = await leaderboard_month(db, game_slug=game_slug, year_month=ym, limit=200)
    for e in board:
        if e.user_id == user_id and e.score == user_score:
            return e.rank
    # If not in top-200, return None-ish (caller checks)
    return -1


async def _rank_all_time(
    db: AsyncSession,
    game_slug: str,
    user_id: int,
    user_score: int,
) -> int:
    board = await leaderboard_all_time(db, game_slug=game_slug, limit=200)
    for e in board:
        if e.user_id == user_id and e.score == user_score:
            return e.rank
    return -1


# ---------------------------------------------------------------------------
# My stats
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MyGameStat:
    game_slug: str
    best_score: int
    runs_count: int
    last_played: datetime | None
    rank_month: int | None
    rank_all_time: int | None


async def my_stats(
    db: AsyncSession,
    user: User,
) -> list[MyGameStat]:
    out: list[MyGameStat] = []
    now = datetime.now(UTC)
    for game in all_games():
        rows = (await db.execute(
            select(
                func.max(ArcadeRun.score),
                func.count(ArcadeRun.id),
                func.max(ArcadeRun.ended_at),
            ).where(
                ArcadeRun.user_id == user.id,
                ArcadeRun.game_slug == game.slug,
                ArcadeRun.status == "ended",
            )
        )).one()
        best, count, last = rows
        best = int(best or 0)
        count = int(count or 0)
        rm = await _rank_in_month(db, game.slug, user.id, best, now) if best else -1
        ra = await _rank_all_time(db, game.slug, user.id, best) if best else -1
        out.append(MyGameStat(
            game_slug=game.slug,
            best_score=best,
            runs_count=count,
            last_played=last,
            rank_month=rm if rm > 0 else None,
            rank_all_time=ra if ra > 0 else None,
        ))
    return out


# ---------------------------------------------------------------------------
# Hall of fame
# ---------------------------------------------------------------------------


async def hall_of_fame(
    db: AsyncSession,
    *,
    limit_months: int = 12,
) -> list[dict[str, Any]]:
    """Return frozen monthly podiums, grouped by (year_month, game_slug)."""
    rows = (await db.execute(
        select(
            ArcadeMonthlyWinner.year_month,
            ArcadeMonthlyWinner.game_slug,
            ArcadeMonthlyWinner.rank,
            ArcadeMonthlyWinner.user_id,
            ArcadeMonthlyWinner.score,
            ArcadeMonthlyWinner.payout_karma,
            ArcadeMonthlyWinner.payout_keys,
            ArcadeMonthlyWinner.title_grant,
            User.nickname,
            User.avatar_url,
        )
        .join(User, User.id == ArcadeMonthlyWinner.user_id)
        .order_by(
            ArcadeMonthlyWinner.year_month.desc(),
            ArcadeMonthlyWinner.game_slug.asc(),
            ArcadeMonthlyWinner.rank.asc(),
        )
        .limit(limit_months * 40)  # 4 games × 10 ranks × N months
    )).all()
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for (ym, slug, rank, uid, score, karma, keys, title, nick, avatar) in rows:
        grouped.setdefault((ym, slug), []).append({
            "rank": rank,
            "user_id": uid,
            "user_nickname": nick,
            "user_avatar_url": avatar,
            "score": score,
            "payout_karma": karma,
            "payout_keys": keys,
            "title_grant": title,
        })
    return [
        {"year_month": ym, "game_slug": slug, "entries": entries}
        for (ym, slug), entries in grouped.items()
    ]


# ---------------------------------------------------------------------------
# Daily bonus — claim once per server-day (MSK)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DailyBonusResult:
    granted: bool
    karma_granted: int
    streak: int
    next_in_seconds: int


def _msk_today() -> date:
    return (datetime.now(UTC) + timedelta(hours=3)).date()


async def claim_daily_bonus(
    db: AsyncSession,
    user: User,
) -> DailyBonusResult:
    today = _msk_today()
    yesterday = today - timedelta(days=1)
    existing_today = (await db.execute(
        select(ArcadeDailyBonus).where(
            ArcadeDailyBonus.user_id == user.id,
            ArcadeDailyBonus.claim_date == today,
        )
    )).scalar_one_or_none()
    if existing_today is not None:
        # Compute next-reset delta to midnight MSK.
        now_msk = datetime.now(UTC) + timedelta(hours=3)
        tomorrow_msk = datetime(
            now_msk.year, now_msk.month, now_msk.day,
        ) + timedelta(days=1)
        return DailyBonusResult(
            granted=False,
            karma_granted=0,
            streak=existing_today.streak_after,
            next_in_seconds=int((tomorrow_msk - now_msk).total_seconds()),
        )

    yesterday_row = (await db.execute(
        select(ArcadeDailyBonus).where(
            ArcadeDailyBonus.user_id == user.id,
            ArcadeDailyBonus.claim_date == yesterday,
        )
    )).scalar_one_or_none()
    streak = (yesterday_row.streak_after + 1) if yesterday_row is not None else 1
    # Bonus curve: 10 base + min(streak-1, 14) × 2
    karma = 10 + min(streak - 1, 14) * 2

    row = ArcadeDailyBonus(
        user_id=user.id,
        claim_date=today,
        streak_after=streak,
        karma_granted=karma,
    )
    db.add(row)
    user.karma = (user.karma or 0) + karma
    return DailyBonusResult(
        granted=True,
        karma_granted=karma,
        streak=streak,
        next_in_seconds=24 * 3600,
    )


async def daily_bonus_status(
    db: AsyncSession,
    user: User,
) -> DailyBonusResult:
    today = _msk_today()
    yesterday = today - timedelta(days=1)
    existing_today = (await db.execute(
        select(ArcadeDailyBonus).where(
            ArcadeDailyBonus.user_id == user.id,
            ArcadeDailyBonus.claim_date == today,
        )
    )).scalar_one_or_none()
    if existing_today is not None:
        now_msk = datetime.now(UTC) + timedelta(hours=3)
        tomorrow_msk = datetime(
            now_msk.year, now_msk.month, now_msk.day,
        ) + timedelta(days=1)
        return DailyBonusResult(
            granted=False,
            karma_granted=0,
            streak=existing_today.streak_after,
            next_in_seconds=int((tomorrow_msk - now_msk).total_seconds()),
        )
    yesterday_row = (await db.execute(
        select(ArcadeDailyBonus).where(
            ArcadeDailyBonus.user_id == user.id,
            ArcadeDailyBonus.claim_date == yesterday,
        )
    )).scalar_one_or_none()
    streak = (yesterday_row.streak_after + 1) if yesterday_row is not None else 1
    return DailyBonusResult(
        granted=False,
        karma_granted=0,
        streak=streak - 1 if streak > 0 else 0,
        next_in_seconds=0,
    )
