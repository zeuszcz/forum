"""Case opening service: weighted random pick + reward dispatch.

Reward kinds applied here:
    'xp'        → user.bonus_xp += reward_value
    'perk'      → adds reward_payload slug to user.granted_perks
    'currency'  → reserved for future in-app currency

Key economy: when a user completes ALL of today's quests, they earn one
case key (granted in `award_keys_for_completed_day`). Keys are stored as
both a fast counter (users.case_keys) and an audit row (user_keys).
"""
from __future__ import annotations

import random
from datetime import UTC, datetime
from typing import cast

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case, CaseItem, CaseOpening, UserKey
from app.models.quest import UserDailyQuest
from app.models.user import User


async def list_cases(db: AsyncSession) -> list[Case]:
    # Cheapest cases first so newcomers see what they can afford
    rows = await db.execute(
        select(Case)
        .where(Case.is_active.is_(True))
        .order_by(Case.key_cost, Case.id)
    )
    return list(rows.scalars().all())


async def get_case_with_items(
    db: AsyncSession, case_id: int
) -> tuple[Case, list[CaseItem]]:
    case_q = await db.execute(select(Case).where(Case.id == case_id, Case.is_active.is_(True)))
    case = case_q.scalar_one_or_none()
    if case is None:
        raise HTTPException(status_code=404, detail="Кейс не найден")
    items_q = await db.execute(
        select(CaseItem).where(CaseItem.case_id == case_id).order_by(CaseItem.weight.desc())
    )
    return case, list(items_q.scalars().all())


def _weighted_pick(items: list[CaseItem]) -> CaseItem:
    total = sum(max(0, i.weight or 0) for i in items)
    if total <= 0:
        return random.choice(items)
    r = random.uniform(0, total)
    acc = 0.0
    for item in items:
        acc += max(0, item.weight or 0)
        if r <= acc:
            return item
    return items[-1]


async def open_case(db: AsyncSession, user: User, case_id: int) -> dict:
    """Spend a key, roll an item, apply reward, log the opening."""
    case, items = await get_case_with_items(db, case_id)
    if not items:
        raise HTTPException(status_code=400, detail="Кейс пустой")

    if (user.case_keys or 0) < case.key_cost:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Не хватает ключей: нужно {case.key_cost}, есть {user.case_keys or 0}",
        )

    # Spend the keys: mark `key_cost` user_keys rows as consumed
    keys_q = await db.execute(
        select(UserKey)
        .where(UserKey.user_id == user.id, UserKey.consumed_at.is_(None))
        .order_by(UserKey.granted_at)
        .limit(case.key_cost)
    )
    keys_to_spend = list(keys_q.scalars().all())
    if len(keys_to_spend) < case.key_cost:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ключи в БД не сходятся со счётчиком — обратись к админу",
        )
    now = datetime.now(UTC)
    for k in keys_to_spend:
        k.consumed_at = now
    user.case_keys = max(0, (user.case_keys or 0) - case.key_cost)

    # Roll
    item = _weighted_pick(items)

    # Apply reward
    if item.reward_kind == "xp":
        user.bonus_xp = (user.bonus_xp or 0) + (item.reward_value or 0)
    elif item.reward_kind == "perk" and item.reward_payload:
        granted = list(user.granted_perks or [])
        if item.reward_payload not in granted:
            granted.append(item.reward_payload)
            user.granted_perks = granted
    elif item.reward_kind == "keys":
        # Refund keys: grant N more case_keys (recursive opens possible).
        # Each refunded key gets its own audit row.
        for _ in range(item.reward_value or 0):
            db.add(
                UserKey(
                    user_id=user.id,
                    granted_for=f"case_drop:{case.slug}",
                    granted_at=now,
                )
            )
        user.case_keys = (user.case_keys or 0) + (item.reward_value or 0)
    elif item.reward_kind == "title" and item.reward_payload:
        # Pre-made vanity title — overwrite user's current title with the
        # payload string. Bypasses the lvl-25 custom_title gate since it's
        # an admin-curated cosmetic, not free-text input.
        user.title = item.reward_payload[:80]

    # Log
    db.add(
        CaseOpening(
            user_id=user.id,
            case_id=case.id,
            case_item_id=item.id,
            opened_at=now,
        )
    )

    await db.commit()
    return {
        "case": {
            "id": case.id,
            "slug": case.slug,
            "title": case.title,
        },
        "reward": {
            "id": item.id,
            "title": item.title,
            "rarity": item.rarity,
            "reward_kind": item.reward_kind,
            "reward_value": item.reward_value,
            "reward_payload": item.reward_payload,
            "icon_color": item.icon_color,
        },
        "remaining_keys": user.case_keys,
        "bonus_xp": user.bonus_xp,
    }


async def grant_key(
    db: AsyncSession, user: User, *, reason: str = "manual"
) -> None:
    """Add one case key to the user (audit row + counter)."""
    db.add(
        UserKey(
            user_id=user.id,
            granted_for=reason,
            granted_at=datetime.now(UTC),
        )
    )
    user.case_keys = (user.case_keys or 0) + 1


async def maybe_grant_key_for_quest_completion(
    db: AsyncSession, user: User
) -> bool:
    """Called after a quest progresses. If today's quests are ALL done AND
    we haven't already granted a key for today, give one. Returns True if
    a key was granted in this call."""
    from datetime import date as _date

    today = datetime.now(UTC).date()

    # Are all today's quests completed?
    counts_q = await db.execute(
        select(
            func.count().label("total"),
            func.count(UserDailyQuest.completed_at).label("done"),
        ).where(UserDailyQuest.user_id == user.id, UserDailyQuest.day == today)
    )
    row = counts_q.one()
    total, done = row[0], row[1]
    if total == 0 or done < total:
        return False

    # Already granted today?
    already_q = await db.execute(
        select(func.count())
        .select_from(UserKey)
        .where(
            UserKey.user_id == user.id,
            UserKey.granted_for == "all_quests_today",
            cast(_date, func.date(UserKey.granted_at)) == today,
        )
    )
    if (already_q.scalar_one() or 0) > 0:
        return False

    await grant_key(db, user, reason="all_quests_today")
    return True
