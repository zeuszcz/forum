"""prison_break — workshop + market HTTP routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.prison_break import (
    PrisonBreakInventory,
    PrisonBreakPlayer,
)
from app.routers.prison_break.actions import _resolve_player
from app.services.prison_break import craft_service, market_service


craft_router = APIRouter(prefix="/api/event/prison-break/workshop", tags=["prison_break_workshop"])
market_router = APIRouter(prefix="/api/event/prison-break/market", tags=["prison_break_market"])


# ---------------------------------------------------------------------------
# Workshop
# ---------------------------------------------------------------------------


class RecipeOut(BaseModel):
    slug: str
    name: str
    emoji: str
    ap_cost: int
    cost_money: int
    cost_scrap: int
    cost_paper: int
    required_taps: int
    description: str
    effect_summary: str


class StartCraftRequest(BaseModel):
    recipe_slug: str = Field(min_length=1, max_length=32)


class CraftStateResponse(BaseModel):
    active: bool
    recipe: RecipeOut | None = None
    tap_count: int = 0
    required_taps: int = 0
    perfect_count: int = 0
    perfect_ratio: float = 0.0
    complete: bool = False
    quality: str | None = None
    item_name: str | None = None
    item_emoji: str | None = None


@craft_router.get("/recipes", response_model=list[RecipeOut])
async def list_recipes() -> list[RecipeOut]:
    return [RecipeOut(**craft_service.recipe_to_dict(r)) for r in craft_service.RECIPES.values()]


@craft_router.post("/start", response_model=CraftStateResponse)
async def start_craft(
    payload: StartCraftRequest,
    user: CurrentUser,
    db: DbSession,
) -> CraftStateResponse:
    _, player = await _resolve_player(db, user.id)
    try:
        st = await craft_service.start_craft(db, player, payload.recipe_slug)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e
    return CraftStateResponse(
        active=True,
        recipe=RecipeOut(**st["recipe"]),
        tap_count=st["tap_count"],
        required_taps=st["required_taps"],
        perfect_count=st["perfect_count"],
    )


@craft_router.post("/tap", response_model=CraftStateResponse)
async def tap(
    user: CurrentUser,
    db: DbSession,
) -> CraftStateResponse:
    _, player = await _resolve_player(db, user.id)
    try:
        result = await craft_service.submit_tap(db, player)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e
    if result.get("complete"):
        return CraftStateResponse(
            active=False,
            complete=True,
            quality=result["quality"],
            perfect_ratio=result["perfect_ratio"],
            item_name=result["item_name"],
            item_emoji=result["item_emoji"],
        )
    return CraftStateResponse(
        active=True,
        recipe=RecipeOut(**result["recipe"]),
        tap_count=result["tap_count"],
        required_taps=result["required_taps"],
        perfect_count=result["perfect_count"],
        perfect_ratio=result.get("perfect_ratio", 0.0),
    )


@craft_router.post("/cancel", response_model=CraftStateResponse)
async def cancel_craft(
    user: CurrentUser,
    db: DbSession,
) -> CraftStateResponse:
    _, player = await _resolve_player(db, user.id)
    await craft_service.cancel_craft(db, player)
    await db.commit()
    return CraftStateResponse(active=False)


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


class InventoryItem(BaseModel):
    id: int
    item_type: str
    quality: str
    acquired_at: str


@craft_router.get("/inventory", response_model=list[InventoryItem])
async def list_inventory(
    user: CurrentUser,
    db: DbSession,
) -> list[InventoryItem]:
    _, player = await _resolve_player(db, user.id)
    rows = (await db.execute(
        select(PrisonBreakInventory).where(
            PrisonBreakInventory.owner_id == player.id,
        ).order_by(PrisonBreakInventory.id.desc())
    )).scalars().all()
    return [
        InventoryItem(
            id=r.id,
            item_type=r.item_type,
            quality=r.quality,
            acquired_at=r.acquired_at.isoformat(),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Market
# ---------------------------------------------------------------------------


class PlaceOrderRequest(BaseModel):
    side: str = Field(pattern=r"^(bid|ask)$")
    resource: str = Field(min_length=1, max_length=32)
    qty: int = Field(ge=1, le=999)
    price: int = Field(ge=1, le=100_000)


class OrderResponse(BaseModel):
    order_id: int
    status: str
    qty_filled: int
    trades: list[dict[str, Any]] = []


class BookEntry(BaseModel):
    id: int
    owner_id: int
    qty: int
    price: int


class RecentTrade(BaseModel):
    id: int
    side: str
    qty: int
    price: int
    owner_id: int


class BookResponse(BaseModel):
    resource: str
    bids: list[BookEntry]
    asks: list[BookEntry]
    recent: list[RecentTrade]


class OwnOrder(BaseModel):
    id: int
    side: str
    resource: str
    qty: int
    qty_total: int
    price: int
    status: str


@market_router.post("/orders", response_model=OrderResponse)
async def place(
    payload: PlaceOrderRequest,
    user: CurrentUser,
    db: DbSession,
) -> OrderResponse:
    _, player = await _resolve_player(db, user.id)
    try:
        r = await market_service.place_order(
            db, player, payload.side, payload.resource, payload.qty, payload.price,
        )
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e
    return OrderResponse(**r)


@market_router.delete("/orders/{order_id}")
async def cancel(
    order_id: int,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    _, player = await _resolve_player(db, user.id)
    try:
        r = await market_service.cancel_order(db, player, order_id)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e
    return r


@market_router.get("/book/{resource}", response_model=BookResponse)
async def book(
    resource: str,
    user: CurrentUser,
    db: DbSession,
) -> BookResponse:
    _, player = await _resolve_player(db, user.id)
    r = await market_service.get_book(db, player.event_id, resource)
    return BookResponse(
        resource=r["resource"],
        bids=[BookEntry(**b) for b in r["bids"]],
        asks=[BookEntry(**a) for a in r["asks"]],
        recent=[RecentTrade(**t) for t in r["recent"]],
    )


@market_router.get("/my-orders", response_model=list[OwnOrder])
async def my_orders(
    user: CurrentUser,
    db: DbSession,
) -> list[OwnOrder]:
    _, player = await _resolve_player(db, user.id)
    rs = await market_service.list_own_orders(db, player)
    return [OwnOrder(**r) for r in rs]
