"""prison_break — black market order book + matching engine.

A standard price/time-priority limit order book for each (event, resource)
combination. Resources we trade right now:
  * money     — base currency, used as the QUOTE always
  * scrap     — 🔩
  * paper     — 📜
  * crowbar / forged_key / radio / screwdriver / syringe / prayer — items

Orders are:
  side       = "bid" (buy)  or "ask" (sell)
  resource   = what's being bought / sold
  qty_total  = original size
  qty_remaining = open size
  price_per_unit = always in money (🪙)

Matching:
  When a new BID arrives: cross against best ASKs at price <= bid.price,
  cheapest first, oldest first as tie-break.
  When a new ASK arrives: cross against best BIDs at price >= ask.price,
  highest first, oldest first as tie-break.
  Partial fills supported. Both sides' qty_remaining decrement; tax 5%
  goes to the event's tax pool (config.tax_pool += tax) for endgame
  distribution.

Anti-collusion:
  Track pair-of-users trade count per 24h. If >= 3 in last 24h, reject.
  Self-trade rejected outright.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakEvent,
    PrisonBreakInventory,
    PrisonBreakMarketOrder,
    PrisonBreakPlayer,
)


RESOURCE_STAT_MAP = {
    "money": "money",
    "scrap": "resource_scrap",
    "paper": "resource_paper",
}

# Items that can be traded (not just resources)
TRADABLE_ITEMS = {
    "crowbar", "forged_key", "cipher_note", "radio",
    "screwdriver", "syringe", "prayer",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resource_balance(player: PrisonBreakPlayer, resource: str) -> int:
    attr = RESOURCE_STAT_MAP.get(resource)
    if attr is None:
        # An item — count inventory rows.
        return 0  # caller queries DB for items separately
    return getattr(player, attr)


async def _player_item_count(
    db: AsyncSession, player_id: int, item_slug: str,
) -> int:
    res = await db.execute(
        select(func.count()).select_from(PrisonBreakInventory)
        .where(
            PrisonBreakInventory.owner_id == player_id,
            PrisonBreakInventory.item_type == item_slug,
        )
    )
    return res.scalar() or 0


async def _consume_one_item(
    db: AsyncSession, player_id: int, item_slug: str,
) -> bool:
    row = (await db.execute(
        select(PrisonBreakInventory).where(
            PrisonBreakInventory.owner_id == player_id,
            PrisonBreakInventory.item_type == item_slug,
        ).limit(1)
    )).scalar_one_or_none()
    if row is None:
        return False
    await db.delete(row)
    return True


async def _give_item(
    db: AsyncSession,
    event_id: int,
    owner_id: int,
    item_slug: str,
    quality: str = "good",
) -> None:
    db.add(PrisonBreakInventory(
        event_id=event_id,
        owner_id=owner_id,
        item_type=item_slug,
        quality=quality,
    ))


def _adjust_resource(
    player: PrisonBreakPlayer, resource: str, delta: int,
) -> None:
    attr = RESOURCE_STAT_MAP.get(resource)
    if attr is None:
        return
    setattr(player, attr, getattr(player, attr) + delta)


async def _check_anti_collusion(
    db: AsyncSession, user_a: int, user_b: int, event_id: int,
) -> bool:
    """Return True if pair (a,b) has already traded 3+ times in last 24h."""
    if user_a == user_b:
        return True
    since = datetime.now(UTC) - timedelta(hours=24)
    # Two queries: count orders where one party is bidder and other was
    # owner of matched ask, in last 24h. Simpler: scan recent
    # closed orders for this event and count by owner_id pair.
    # For MVP, just scan PrisonBreakMarketOrder for last 24h.
    rows = await db.execute(
        select(PrisonBreakMarketOrder).where(
            PrisonBreakMarketOrder.event_id == event_id,
            PrisonBreakMarketOrder.closed_at.is_not(None),
            PrisonBreakMarketOrder.closed_at >= since,
            PrisonBreakMarketOrder.owner_id.in_([user_a, user_b]),
        )
    )
    closed = list(rows.scalars())
    # We don't have explicit per-trade record (yet) — count cross-owner
    # closures in this window.
    return len(closed) >= 6  # 3 trades = 6 closed orders (bid + ask each)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def place_order(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    side: str,
    resource: str,
    qty: int,
    price: int,
) -> dict[str, Any]:
    if side not in ("bid", "ask"):
        raise ValueError("side must be bid or ask")
    if qty < 1 or qty > 999:
        raise ValueError("qty must be 1-999")
    if price < 1 or price > 100_000:
        raise ValueError("price must be 1-100000")
    if resource not in RESOURCE_STAT_MAP and resource not in TRADABLE_ITEMS:
        raise ValueError(f"unknown resource {resource!r}")
    if resource == "money":
        raise ValueError("money is the quote currency, can't be a side")

    # Reserve seller's stock / buyer's money up-front.
    if side == "ask":
        if resource in RESOURCE_STAT_MAP:
            if _resource_balance(player, resource) < qty:
                raise ValueError(f"not enough {resource}")
            _adjust_resource(player, resource, -qty)
        else:  # tradable item
            available = await _player_item_count(db, player.id, resource)
            if available < qty:
                raise ValueError(f"not enough {resource} in inventory")
            for _ in range(qty):
                await _consume_one_item(db, player.id, resource)
    else:  # bid
        total = qty * price
        if player.money < total:
            raise ValueError("not enough money to bid")
        player.money -= total

    order = PrisonBreakMarketOrder(
        event_id=player.event_id,
        owner_id=player.id,
        side=side,
        resource=resource,
        qty_total=qty,
        qty_remaining=qty,
        price_per_unit=price,
        status="open",
    )
    db.add(order)
    await db.flush()

    # Try matching immediately
    matched = await _match_against_book(db, order)
    return {
        "order_id": order.id,
        "status": order.status,
        "qty_filled": qty - order.qty_remaining,
        "trades": matched,
    }


async def cancel_order(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    order_id: int,
) -> dict[str, Any]:
    order = (await db.execute(
        select(PrisonBreakMarketOrder).where(
            PrisonBreakMarketOrder.id == order_id,
            PrisonBreakMarketOrder.owner_id == player.id,
            PrisonBreakMarketOrder.status.in_(["open", "partial"]),
        )
    )).scalar_one_or_none()
    if order is None:
        raise ValueError("order not found or not cancellable")
    # Refund remaining reserve
    if order.side == "ask":
        if order.resource in RESOURCE_STAT_MAP:
            _adjust_resource(player, order.resource, order.qty_remaining)
        else:
            for _ in range(order.qty_remaining):
                await _give_item(db, player.event_id, player.id, order.resource)
    else:
        player.money += order.qty_remaining * order.price_per_unit
    order.status = "cancelled"
    order.qty_remaining = 0
    order.closed_at = datetime.now(UTC)
    return {"ok": True, "order_id": order.id}


# ---------------------------------------------------------------------------
# Matching engine
# ---------------------------------------------------------------------------


async def _match_against_book(
    db: AsyncSession,
    incoming: PrisonBreakMarketOrder,
) -> list[dict[str, Any]]:
    """Cross `incoming` against existing book orders on the opposite side."""
    trades: list[dict[str, Any]] = []
    opposite = "ask" if incoming.side == "bid" else "bid"
    while incoming.qty_remaining > 0:
        # Best counter: lowest price for ask, highest for bid; oldest first
        if incoming.side == "bid":
            candidate_q = (
                select(PrisonBreakMarketOrder)
                .where(
                    PrisonBreakMarketOrder.event_id == incoming.event_id,
                    PrisonBreakMarketOrder.resource == incoming.resource,
                    PrisonBreakMarketOrder.side == opposite,
                    PrisonBreakMarketOrder.status.in_(["open", "partial"]),
                    PrisonBreakMarketOrder.price_per_unit <= incoming.price_per_unit,
                    PrisonBreakMarketOrder.owner_id != incoming.owner_id,
                )
                .order_by(
                    PrisonBreakMarketOrder.price_per_unit.asc(),
                    PrisonBreakMarketOrder.id.asc(),
                )
                .limit(1)
            )
        else:
            candidate_q = (
                select(PrisonBreakMarketOrder)
                .where(
                    PrisonBreakMarketOrder.event_id == incoming.event_id,
                    PrisonBreakMarketOrder.resource == incoming.resource,
                    PrisonBreakMarketOrder.side == opposite,
                    PrisonBreakMarketOrder.status.in_(["open", "partial"]),
                    PrisonBreakMarketOrder.price_per_unit >= incoming.price_per_unit,
                    PrisonBreakMarketOrder.owner_id != incoming.owner_id,
                )
                .order_by(
                    PrisonBreakMarketOrder.price_per_unit.desc(),
                    PrisonBreakMarketOrder.id.asc(),
                )
                .limit(1)
            )
        match = (await db.execute(candidate_q)).scalar_one_or_none()
        if match is None:
            break

        # Anti-collusion
        if await _check_anti_collusion(
            db, incoming.owner_id, match.owner_id, incoming.event_id,
        ):
            # Skip this counterparty — continue search by raising price filter
            # is hard with SQL; for MVP, abort matching against this counter.
            break

        fill_qty = min(incoming.qty_remaining, match.qty_remaining)
        execution_price = match.price_per_unit
        total_money = fill_qty * execution_price
        tax = total_money * 5 // 100
        seller_take = total_money - tax

        # Determine who is buyer / seller
        if incoming.side == "bid":
            buyer = incoming
            seller = match
        else:
            buyer = match
            seller = incoming

        # Fetch player rows for credit/debit
        buyer_player = (await db.execute(
            select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == buyer.owner_id)
        )).scalar_one()
        seller_player = (await db.execute(
            select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == seller.owner_id)
        )).scalar_one()

        # Money already reserved from buyer at order-place time. Now credit seller.
        seller_player.money += seller_take

        # Buyer was charged at bid_price; if execution < bid, refund the diff.
        if buyer.side == "bid" and buyer.price_per_unit > execution_price:
            buyer_player.money += (buyer.price_per_unit - execution_price) * fill_qty

        # Transfer goods to buyer
        if incoming.resource in RESOURCE_STAT_MAP:
            _adjust_resource(buyer_player, incoming.resource, fill_qty)
        else:
            for _ in range(fill_qty):
                await _give_item(
                    db, incoming.event_id, buyer_player.id, incoming.resource,
                )

        # Update event tax pool
        event = (await db.execute(
            select(PrisonBreakEvent).where(PrisonBreakEvent.id == incoming.event_id)
        )).scalar_one()
        cfg = dict(event.config or {})
        cfg["tax_pool"] = int(cfg.get("tax_pool", 0)) + tax
        event.config = cfg

        # Update qty
        incoming.qty_remaining -= fill_qty
        match.qty_remaining -= fill_qty
        if match.qty_remaining == 0:
            match.status = "filled"
            match.closed_at = datetime.now(UTC)
        else:
            match.status = "partial"
        trades.append({
            "buyer_id": buyer_player.id,
            "seller_id": seller_player.id,
            "qty": fill_qty,
            "price": execution_price,
            "total": total_money,
            "tax": tax,
        })

    if incoming.qty_remaining == 0:
        incoming.status = "filled"
        incoming.closed_at = datetime.now(UTC)
    elif incoming.qty_remaining < incoming.qty_total:
        incoming.status = "partial"

    return trades


async def get_book(
    db: AsyncSession,
    event_id: int,
    resource: str,
    depth: int = 20,
) -> dict[str, Any]:
    """Top-N orders per side, plus recent fills."""
    bids = (await db.execute(
        select(PrisonBreakMarketOrder)
        .where(
            PrisonBreakMarketOrder.event_id == event_id,
            PrisonBreakMarketOrder.resource == resource,
            PrisonBreakMarketOrder.side == "bid",
            PrisonBreakMarketOrder.status.in_(["open", "partial"]),
        )
        .order_by(
            PrisonBreakMarketOrder.price_per_unit.desc(),
            PrisonBreakMarketOrder.id.asc(),
        )
        .limit(depth)
    )).scalars().all()
    asks = (await db.execute(
        select(PrisonBreakMarketOrder)
        .where(
            PrisonBreakMarketOrder.event_id == event_id,
            PrisonBreakMarketOrder.resource == resource,
            PrisonBreakMarketOrder.side == "ask",
            PrisonBreakMarketOrder.status.in_(["open", "partial"]),
        )
        .order_by(
            PrisonBreakMarketOrder.price_per_unit.asc(),
            PrisonBreakMarketOrder.id.asc(),
        )
        .limit(depth)
    )).scalars().all()
    recent = (await db.execute(
        select(PrisonBreakMarketOrder)
        .where(
            PrisonBreakMarketOrder.event_id == event_id,
            PrisonBreakMarketOrder.resource == resource,
            PrisonBreakMarketOrder.status.in_(["filled", "partial"]),
        )
        .order_by(PrisonBreakMarketOrder.closed_at.desc().nullslast(), PrisonBreakMarketOrder.id.desc())
        .limit(10)
    )).scalars().all()
    return {
        "resource": resource,
        "bids": [
            {
                "id": o.id, "owner_id": o.owner_id,
                "qty": o.qty_remaining, "price": o.price_per_unit,
            } for o in bids
        ],
        "asks": [
            {
                "id": o.id, "owner_id": o.owner_id,
                "qty": o.qty_remaining, "price": o.price_per_unit,
            } for o in asks
        ],
        "recent": [
            {
                "id": o.id, "side": o.side, "qty": o.qty_total - o.qty_remaining,
                "price": o.price_per_unit, "owner_id": o.owner_id,
            } for o in recent
        ],
    }


async def list_own_orders(
    db: AsyncSession,
    player: PrisonBreakPlayer,
) -> list[dict[str, Any]]:
    rows = (await db.execute(
        select(PrisonBreakMarketOrder).where(
            PrisonBreakMarketOrder.owner_id == player.id,
            PrisonBreakMarketOrder.status.in_(["open", "partial"]),
        ).order_by(PrisonBreakMarketOrder.id.desc())
    )).scalars().all()
    return [
        {
            "id": o.id,
            "side": o.side,
            "resource": o.resource,
            "qty": o.qty_remaining,
            "qty_total": o.qty_total,
            "price": o.price_per_unit,
            "status": o.status,
        }
        for o in rows
    ]
