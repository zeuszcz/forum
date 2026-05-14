"""arcade HTTP endpoints.

  GET    /api/arcade/games
  POST   /api/arcade/games/{slug}/start
  POST   /api/arcade/games/{slug}/end
  GET    /api/arcade/games/{slug}/leaderboard
  GET    /api/arcade/me/stats
  GET    /api/arcade/me/daily-bonus
  POST   /api/arcade/me/daily-bonus/claim
  GET    /api/arcade/hall-of-fame
  POST   /api/admin/arcade/finalise-month
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.arcade import ArcadeRun
from app.schemas.arcade import (
    DailyBonusOut,
    EndRunRequest,
    EndRunResult,
    FreezeMonthResult,
    GameOut,
    HallOfFameRowOut,
    HallOfFameSection,
    LeaderEntryOut,
    MyGameStatOut,
    StartRunOut,
    StartRunRequest,
)
from app.services import auth as auth_service
from app.services.arcade import arcade_service, games, monthly_freeze


router = APIRouter(prefix="/api/arcade", tags=["arcade"])
admin_router = APIRouter(prefix="/api/admin/arcade", tags=["arcade_admin"])


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


@router.get("/games", response_model=list[GameOut])
async def get_games() -> list[GameOut]:
    return [
        GameOut(
            slug=g.slug,
            title=g.title,
            short=g.short,
            emoji=g.emoji,
            accent=g.accent,
            description=g.description,
            controls=g.controls,
            score_unit=g.score_unit,
            max_score_per_second=g.max_score_per_second,
            min_duration_ms=g.min_duration_ms,
            score_ceiling=g.score_ceiling,
        )
        for g in games.all_games()
    ]


# ---------------------------------------------------------------------------
# Run lifecycle
# ---------------------------------------------------------------------------


@router.post("/games/{slug}/start", response_model=StartRunOut)
async def post_start(
    slug: str,
    payload: StartRunRequest,
    user: CurrentUser,
    db: DbSession,
) -> StartRunOut:
    game = games.get(slug)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="unknown game")
    run = await arcade_service.start_run(
        db, user=user, game=game, client_version=payload.client_version,
    )
    await db.commit()
    return StartRunOut(
        run_id=run.id,
        seed=run.seed,
        started_at=run.started_at,
        client_version=run.client_version,
    )


@router.post("/games/{slug}/end", response_model=EndRunResult)
async def post_end(
    slug: str,
    payload: EndRunRequest,
    user: CurrentUser,
    db: DbSession,
) -> EndRunResult:
    try:
        outcome = await arcade_service.end_run(
            db,
            user=user,
            run_id=payload.run_id,
            score=payload.score,
            duration_ms=payload.duration_ms,
            replay=payload.replay,
        )
        await db.commit()
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return EndRunResult(
        ok=True,
        accepted=outcome.accepted,
        reason=outcome.reason,
        score=outcome.run.score,
        rank_in_month=outcome.rank_in_month if outcome.rank_in_month and outcome.rank_in_month > 0 else None,
        rank_all_time=outcome.rank_all_time if outcome.rank_all_time and outcome.rank_all_time > 0 else None,
    )


# ---------------------------------------------------------------------------
# Leaderboards
# ---------------------------------------------------------------------------


@router.get("/games/{slug}/leaderboard", response_model=dict)
async def get_leaderboard(
    slug: str,
    user: CurrentUser,
    db: DbSession,
    period: str = Query(default="month", pattern=r"^(month|all)$"),
    year_month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    game = games.get(slug)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="unknown game")
    if period == "all":
        entries = await arcade_service.leaderboard_all_time(
            db, game_slug=slug, limit=limit,
        )
    else:
        entries = await arcade_service.leaderboard_month(
            db, game_slug=slug, year_month=year_month, limit=limit,
        )
    return {
        "game_slug": slug,
        "period": period,
        "year_month": year_month,
        "entries": [
            LeaderEntryOut(
                rank=e.rank, user_id=e.user_id, user_nickname=e.user_nickname,
                user_title=e.user_title, user_avatar_url=e.user_avatar_url,
                score=e.score, ended_at=e.ended_at, run_id=e.run_id,
            )
            for e in entries
        ],
    }


# ---------------------------------------------------------------------------
# My stats + daily bonus
# ---------------------------------------------------------------------------


@router.get("/me/stats", response_model=list[MyGameStatOut])
async def get_my_stats(
    user: CurrentUser,
    db: DbSession,
) -> list[MyGameStatOut]:
    stats = await arcade_service.my_stats(db, user)
    return [
        MyGameStatOut(
            game_slug=s.game_slug,
            best_score=s.best_score,
            runs_count=s.runs_count,
            last_played=s.last_played,
            rank_month=s.rank_month,
            rank_all_time=s.rank_all_time,
        )
        for s in stats
    ]


@router.get("/me/daily-bonus", response_model=DailyBonusOut)
async def get_daily_bonus(
    user: CurrentUser,
    db: DbSession,
) -> DailyBonusOut:
    r = await arcade_service.daily_bonus_status(db, user)
    return DailyBonusOut(
        granted=r.granted,
        karma_granted=r.karma_granted,
        streak=r.streak,
        next_in_seconds=r.next_in_seconds,
    )


@router.post("/me/daily-bonus/claim", response_model=DailyBonusOut)
async def post_claim_daily_bonus(
    user: CurrentUser,
    db: DbSession,
) -> DailyBonusOut:
    r = await arcade_service.claim_daily_bonus(db, user)
    await db.commit()
    return DailyBonusOut(
        granted=r.granted,
        karma_granted=r.karma_granted,
        streak=r.streak,
        next_in_seconds=r.next_in_seconds,
    )


# ---------------------------------------------------------------------------
# Hall of fame
# ---------------------------------------------------------------------------


@router.get("/hall-of-fame", response_model=list[HallOfFameSection])
async def get_hall_of_fame(
    user: CurrentUser,
    db: DbSession,
    limit_months: int = Query(default=12, ge=1, le=36),
) -> list[HallOfFameSection]:
    sections = await arcade_service.hall_of_fame(db, limit_months=limit_months)
    return [
        HallOfFameSection(
            year_month=s["year_month"],
            game_slug=s["game_slug"],
            entries=[HallOfFameRowOut(**row) for row in s["entries"]],
        )
        for s in sections
    ]


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


@admin_router.post("/finalise-month", response_model=FreezeMonthResult)
async def post_finalise_month(
    user: CurrentUser,
    db: DbSession,
    year_month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
) -> FreezeMonthResult:
    roles = await auth_service.get_user_roles(db, user.id)
    if not any(getattr(r, "is_staff", False) for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="staff only",
        )
    report = await monthly_freeze.freeze_month(db, year_month)
    await db.commit()
    return FreezeMonthResult(
        ok=True,
        year_month=report.year_month,
        rows_written=report.rows_written,
        karma_credited=report.karma_credited,
        keys_credited=report.keys_credited,
        titles_granted=report.titles_granted,
        skipped_already_frozen=report.skipped_already_frozen,
    )
