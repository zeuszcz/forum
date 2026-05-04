"""Daily-quest service: lazy daily roll + progress tracking.

Hooks (called from forum service after relevant write actions):
    bump_post_count(user, db)
    bump_thread_count(user, db)
    bump_react_given(user, db)
    bump_react_received(user, db)

Read path:
    get_today_quests(user, db) — returns user's quests for today; if none
    exist yet, picks N weighted-random active templates and persists them.
"""
from __future__ import annotations

import random
from datetime import UTC, date, datetime
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quest import DailyQuest, UserDailyQuest
from app.models.user import User

QUESTS_PER_DAY = 3


def _today() -> date:
    return datetime.now(UTC).date()


async def get_today_quests(
    db: AsyncSession, user: User
) -> tuple[list[UserDailyQuest], dict[int, DailyQuest]]:
    """Return today's quests for the user (creating them if absent)."""
    today = _today()
    rows = await db.execute(
        select(UserDailyQuest).where(
            UserDailyQuest.user_id == user.id, UserDailyQuest.day == today
        )
    )
    user_quests = list(rows.scalars().all())

    if not user_quests:
        # Roll new quests for today: weighted random sample without replacement.
        active_q = await db.execute(
            select(DailyQuest).where(DailyQuest.is_active.is_(True))
        )
        pool = list(active_q.scalars().all())
        if not pool:
            return [], {}
        # Weighted shuffle: assign each a key = -log(rand)/weight, sort ascending
        rolled: list[DailyQuest] = []
        weights = [(q, q.weight or 1) for q in pool]
        random.shuffle(weights)
        # Greedy weighted pick — simpler than full Efraimidis-Spirakis here:
        for _ in range(min(QUESTS_PER_DAY, len(weights))):
            total = sum(w for _, w in weights)
            r = random.uniform(0, total)
            acc = 0.0
            for i, (q, w) in enumerate(weights):
                acc += w
                if r <= acc:
                    rolled.append(q)
                    weights.pop(i)
                    break

        for q in rolled:
            uq = UserDailyQuest(user_id=user.id, quest_id=q.id, day=today, progress=0)
            db.add(uq)
            user_quests.append(uq)
        await db.commit()
        for uq in user_quests:
            await db.refresh(uq)

    quest_ids = {uq.quest_id for uq in user_quests}
    defs_q = await db.execute(select(DailyQuest).where(DailyQuest.id.in_(quest_ids)))
    defs = {q.id: q for q in defs_q.scalars().all()}
    return user_quests, defs


async def _bump_kind(
    db: AsyncSession, user: User, kind: str, delta: int = 1
) -> None:
    """Increment progress on today's quests of the given requirement_kind."""
    today = _today()
    rows = await db.execute(
        select(UserDailyQuest, DailyQuest)
        .join(DailyQuest, DailyQuest.id == UserDailyQuest.quest_id)
        .where(
            UserDailyQuest.user_id == user.id,
            UserDailyQuest.day == today,
            UserDailyQuest.completed_at.is_(None),
            DailyQuest.requirement_kind == kind,
        )
    )
    for uq, q in rows.all():
        uq.progress = min(q.requirement_value, uq.progress + delta)
        if uq.progress >= q.requirement_value:
            uq.completed_at = datetime.now(UTC)
            user.bonus_xp = (user.bonus_xp or 0) + (q.reward_xp or 0)


async def bump_post_count(db: AsyncSession, user: User) -> None:
    await _bump_kind(db, user, "post_count")


async def bump_thread_count(db: AsyncSession, user: User) -> None:
    await _bump_kind(db, user, "thread_count")


async def bump_react_given(db: AsyncSession, user: User) -> None:
    await _bump_kind(db, user, "react_given")


async def bump_react_received(db: AsyncSession, user: User) -> None:
    await _bump_kind(db, user, "react_received")


async def kinds_to_bump(actions: Iterable[str]) -> list[str]:
    """Helper for tests / batched callers."""
    return [a for a in actions if a in {"post_count", "thread_count", "react_given", "react_received"}]
