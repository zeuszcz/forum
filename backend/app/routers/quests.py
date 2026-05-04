"""Daily quests API.

GET /quests/today  → user's quests for today (lazy-rolled if absent), with
                     definitions and progress.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.services import quests as quest_service

router = APIRouter(prefix="/quests", tags=["quests"])


@router.get("/today")
async def get_today(user: CurrentUser, db: DbSession) -> dict:
    user_quests, defs = await quest_service.get_today_quests(db, user)
    out: list[dict] = []
    for uq in user_quests:
        q = defs.get(uq.quest_id)
        if q is None:
            continue
        out.append(
            {
                "id": uq.id,
                "quest_id": q.id,
                "slug": q.slug,
                "title": q.title,
                "description": q.description,
                "requirement_kind": q.requirement_kind,
                "requirement_value": q.requirement_value,
                "reward_xp": q.reward_xp,
                "progress": uq.progress,
                "completed": uq.completed_at is not None,
                "completed_at": uq.completed_at.isoformat() if uq.completed_at else None,
            }
        )
    return {
        "quests": out,
        "completed_count": sum(1 for q in out if q["completed"]),
        "total_count": len(out),
        "bonus_xp": user.bonus_xp,
    }
