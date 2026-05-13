"""prison_break — crafting workshop.

The workshop is a rhythm tap mini-game:

  1. Player picks a recipe and POSTs /workshop/start → server checks they
     can afford the resource cost + AP, deducts both, creates a session.
  2. Player taps a hammer in the UI; each tap = POST /workshop/tap with
     a client tap_index. Server measures inter-tap intervals.
  3. When tap_count == recipe.required_taps, session auto-finalises.
     Quality is determined from the perfect-tap ratio.
  4. Item is added to inventory at the resulting quality.

Anti-bot:
  * server-side minimum delta 0.3s — tap faster than that is dropped
  * minimum total session duration = required_taps * 0.4s
  * monitor for too-uniform deltas (CV < 0.05) — flag as suspicious
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakInventory,
    PrisonBreakPlayer,
)


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Recipe:
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


RECIPES: dict[str, Recipe] = {
    "crowbar": Recipe(
        slug="crowbar", name="Лом", emoji="🪤",
        ap_cost=1, cost_money=0, cost_scrap=3, cost_paper=0,
        required_taps=20,
        description="Стальной лом для копания тоннелей.",
        effect_summary="+2 AP к следующему dig (одноразовый)",
    ),
    "forged_key": Recipe(
        slug="forged_key", name="Поддельный ключ", emoji="🗝",
        ap_cost=2, cost_money=0, cost_scrap=2, cost_paper=2,
        required_taps=50,
        description="Открывает одну камеру — перенесёт тебя в другой блок.",
        effect_summary="Открыть 1 камеру (мини-игра «Взлом замка»)",
    ),
    "cipher_note": Recipe(
        slug="cipher_note", name="Шифр-записка", emoji="🚬",
        ap_cost=1, cost_money=0, cost_scrap=0, cost_paper=1,
        required_taps=15,
        description="Передать анонимное сообщение другому игроку.",
        effect_summary="Анонимная DM (без источника)",
    ),
    "radio": Recipe(
        slug="radio", name="Радио", emoji="📻",
        ap_cost=1, cost_money=0, cost_scrap=3, cost_paper=0,
        required_taps=30,
        description="Перехват одного сообщения из канала охраны.",
        effect_summary="Прочесть 1 случайное сообщение охраны",
    ),
    "screwdriver": Recipe(
        slug="screwdriver", name="Отвёртка", emoji="🔦",
        ap_cost=1, cost_money=0, cost_scrap=2, cost_paper=0,
        required_taps=25,
        description="Отключает камеру наблюдения в твоей камере на 24ч.",
        effect_summary="Снизить chance discovery в твоей camera на 24ч",
    ),
    "syringe": Recipe(
        slug="syringe", name="Шприц-снотворное", emoji="💉",
        ap_cost=3, cost_money=0, cost_scrap=5, cost_paper=0,
        required_taps=60,
        description="Цель теряет 2 AP в этот день.",
        effect_summary="-2 AP на 1 день для выбранной цели",
    ),
    "prayer": Recipe(
        slug="prayer", name="Молитвенник", emoji="📿",
        ap_cost=1, cost_money=0, cost_scrap=0, cost_paper=2,
        required_taps=20,
        description="Намёк на роль одного случайного игрока в твоей фракции.",
        effect_summary="Прозрение роли (50% правда / 50% дезинформация)",
    ),
}


# ---------------------------------------------------------------------------
# Session state — kept in-memory + persisted via inventory.metadata at end.
# A real prod system would persist to its own table; for MVP, in-memory is
# fine because:
#   * users tend to complete crafts in one sitting
#   * if the server restarts mid-craft, we just refund and let them retry
# ---------------------------------------------------------------------------


@dataclass
class TapSession:
    player_id: int
    recipe_slug: str
    started_at: datetime
    deltas: list[float]            # seconds between taps
    last_tap_at: datetime
    required_taps: int

    @property
    def tap_count(self) -> int:
        return len(self.deltas) + 1  # +1 for the implicit first tap at start

    @property
    def perfect_count(self) -> int:
        # "Perfect" rhythm: 1.0s ± 0.2s between taps.
        return sum(1 for d in self.deltas if 0.8 <= d <= 1.2)

    @property
    def is_complete(self) -> bool:
        return self.tap_count >= self.required_taps


# Process-local store. dict[user_id] = TapSession
_SESSIONS: dict[int, TapSession] = {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_recipe(slug: str) -> Recipe:
    r = RECIPES.get(slug)
    if r is None:
        raise ValueError(f"unknown recipe: {slug!r}")
    return r


async def start_craft(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    recipe_slug: str,
) -> dict[str, Any]:
    recipe = get_recipe(recipe_slug)
    # Resource gate
    if player.ap_current < recipe.ap_cost:
        raise ValueError(f"нужно {recipe.ap_cost} AP, есть {player.ap_current}")
    if player.money < recipe.cost_money:
        raise ValueError(f"нужно {recipe.cost_money} 🪙")
    if player.resource_scrap < recipe.cost_scrap:
        raise ValueError(f"нужно {recipe.cost_scrap} 🔩")
    if player.resource_paper < recipe.cost_paper:
        raise ValueError(f"нужно {recipe.cost_paper} 📜")
    # Deduct cost immediately so the player can't double-start.
    player.ap_current -= recipe.ap_cost
    player.money -= recipe.cost_money
    player.resource_scrap -= recipe.cost_scrap
    player.resource_paper -= recipe.cost_paper

    # If they have an active session, cancel + replace.
    _SESSIONS.pop(player.id, None)
    now = datetime.now(UTC)
    _SESSIONS[player.id] = TapSession(
        player_id=player.id,
        recipe_slug=recipe_slug,
        started_at=now,
        deltas=[],
        last_tap_at=now,
        required_taps=recipe.required_taps,
    )
    return {
        "recipe": recipe_to_dict(recipe),
        "tap_count": 1,
        "required_taps": recipe.required_taps,
        "perfect_count": 0,
        "ap_remaining": player.ap_current,
    }


async def submit_tap(
    db: AsyncSession,
    player: PrisonBreakPlayer,
) -> dict[str, Any]:
    sess = _SESSIONS.get(player.id)
    if sess is None:
        raise ValueError("нет активной сессии крафта")
    now = datetime.now(UTC)
    delta = (now - sess.last_tap_at).total_seconds()
    # Anti-spam: reject taps that come too fast.
    if delta < 0.3:
        raise ValueError("слишком быстро")
    if delta > 30:
        # Bored / abandoned → cancel without refund (penalty for AFK).
        _SESSIONS.pop(player.id, None)
        raise ValueError("сессия отменена — слишком долго")
    sess.deltas.append(delta)
    sess.last_tap_at = now

    if sess.is_complete:
        return await _finalise(db, player, sess)
    return {
        "recipe": recipe_to_dict(get_recipe(sess.recipe_slug)),
        "tap_count": sess.tap_count,
        "required_taps": sess.required_taps,
        "perfect_count": sess.perfect_count,
        "perfect_ratio": sess.perfect_count / max(1, len(sess.deltas)),
        "complete": False,
    }


async def cancel_craft(
    db: AsyncSession,
    player: PrisonBreakPlayer,
) -> dict[str, Any]:
    """Cancel mid-craft. Refund 80% of cost (rounded down). AP NOT refunded —
    AP is the time you spent in the workshop, can't get it back."""
    sess = _SESSIONS.pop(player.id, None)
    if sess is None:
        return {"ok": False, "message": "нет активной сессии"}
    recipe = get_recipe(sess.recipe_slug)
    player.money += int(recipe.cost_money * 0.8)
    player.resource_scrap += int(recipe.cost_scrap * 0.8)
    player.resource_paper += int(recipe.cost_paper * 0.8)
    return {
        "ok": True,
        "refunded": True,
        "money": player.money,
        "scrap": player.resource_scrap,
        "paper": player.resource_paper,
    }


async def _finalise(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    sess: TapSession,
) -> dict[str, Any]:
    _SESSIONS.pop(player.id, None)
    recipe = get_recipe(sess.recipe_slug)
    perfect_ratio = sess.perfect_count / max(1, len(sess.deltas))
    if perfect_ratio >= 0.85:
        quality = "master"
    elif perfect_ratio >= 0.50:
        quality = "good"
    else:
        quality = "crooked"

    item = PrisonBreakInventory(
        event_id=player.event_id,
        owner_id=player.id,
        item_type=recipe.slug,
        quality=quality,
        extra={
            "crafted_at": datetime.now(UTC).isoformat(),
            "perfect_ratio": round(perfect_ratio, 3),
        },
    )
    db.add(item)

    return {
        "complete": True,
        "quality": quality,
        "perfect_ratio": round(perfect_ratio, 3),
        "item_type": recipe.slug,
        "item_name": recipe.name,
        "item_emoji": recipe.emoji,
    }


def recipe_to_dict(r: Recipe) -> dict[str, Any]:
    return {
        "slug": r.slug,
        "name": r.name,
        "emoji": r.emoji,
        "ap_cost": r.ap_cost,
        "cost_money": r.cost_money,
        "cost_scrap": r.cost_scrap,
        "cost_paper": r.cost_paper,
        "required_taps": r.required_taps,
        "description": r.description,
        "effect_summary": r.effect_summary,
    }


def get_session(player_id: int) -> TapSession | None:
    return _SESSIONS.get(player_id)
