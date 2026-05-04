"""Cases / lootbox API."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.services import cases as case_service

router = APIRouter(prefix="/cases", tags=["cases"])


def _serialize_case(c, items=None) -> dict:
    out = {
        "id": c.id,
        "slug": c.slug,
        "title": c.title,
        "description": c.description,
        "icon": c.icon,
        "accent": c.accent,
        "key_cost": c.key_cost,
    }
    if items is not None:
        out["items"] = [_serialize_item(i) for i in items]
    return out


def _serialize_item(i) -> dict:
    return {
        "id": i.id,
        "title": i.title,
        "rarity": i.rarity,
        "weight": i.weight,
        "reward_kind": i.reward_kind,
        "reward_value": i.reward_value,
        "reward_payload": i.reward_payload,
        "icon_color": i.icon_color,
    }


@router.get("/")
async def list_cases(db: DbSession, user: OptionalUser) -> dict:
    cases = await case_service.list_cases(db)
    out: list[dict] = []
    for c in cases:
        _, items = await case_service.get_case_with_items(db, c.id)
        out.append(_serialize_case(c, items))
    return {
        "cases": out,
        "user_keys": user.case_keys if user else 0,
    }


@router.get("/{case_id}")
async def get_case(case_id: int, db: DbSession, user: OptionalUser) -> dict:
    case, items = await case_service.get_case_with_items(db, case_id)
    return {
        "case": _serialize_case(case, items),
        "user_keys": user.case_keys if user else 0,
    }


@router.post("/{case_id}/open")
async def open_case(case_id: int, user: CurrentUser, db: DbSession) -> dict:
    return await case_service.open_case(db, user, case_id)
