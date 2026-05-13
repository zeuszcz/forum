"""prison_break — intel generator + distribution + forwarding.

Intel is the social-information layer of the event. Every day the service
generates a fresh batch of "intel atoms" (one-line whispers), seeded from
real game state (cell roster, tunnel progress, alliances, market action)
mixed with templated noise so spies/bosses can plant fabricated entries.

Each intel atom:
  • carries a category — "rumor", "warning", "secret", "leak", "tip"
  • has is_truth=True/False decided at generation
  • optionally references about_user_id / about_cell_id
  • optionally has source_role / source_user_id (who whispered it)

Distribution rules (run by daily_distribute()):
  • Guards see "warning" + "leak" rolls related to their block
  • Authorities see one "secret" each day
  • Prisoners get 1 random "rumor" + occasional "tip"
  • Spies see one extra "leak" pointing at a faction member (50/50 true)
  • Bosses see two "secret" entries each day

Forwarding (run by forward_to()):
  • Any viewer can spend 1 AP to forward one intel atom to another player.
  • Receiver gets a new PrisonBreakIntelView row with forwarded_from_id set.
  • Trust between forwarder and receiver: +2 (passing intel is a trust gesture).
"""
from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAlliance,
    PrisonBreakCell,
    PrisonBreakEvent,
    PrisonBreakIntel,
    PrisonBreakIntelView,
    PrisonBreakPlayer,
    PrisonBreakTrust,
)


# ---------------------------------------------------------------------------
# 30+ template strings, grouped by category + the audience type they serve.
# Each template uses {placeholders} resolved at generation time:
#   {nick}    — random player nickname (excluding self, by role filter)
#   {block}   — A/B/C
#   {cell}    — block + cell number, e.g. "B-3"
#   {target}  — target nickname for actionable intel
#   {faction} — prisoner|guard
#   {role}    — prisoner|guard|authority|spy|boss
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IntelTemplate:
    slug: str
    category: str  # rumor|warning|secret|leak|tip
    text: str
    audience: tuple[str, ...]  # which roles tend to receive it
    truth_bias: float  # 0.0..1.0 probability that the rendered atom is truthful


INTEL_TEMPLATES: list[IntelTemplate] = [
    # --- Tunnel rumors -----------------------------------------------------
    IntelTemplate("rum_tunnel_progress", "rumor",
        "В камере {cell} ночью слышали стук кирки.",
        audience=("prisoner", "authority", "spy"), truth_bias=0.7),
    IntelTemplate("rum_tunnel_close", "rumor",
        "Говорят, в блоке {block} кто-то почти пробил стену.",
        audience=("prisoner", "authority", "spy"), truth_bias=0.55),
    IntelTemplate("rum_tunnel_collapse", "rumor",
        "В камере {cell} тоннель просел — копают заново.",
        audience=("prisoner", "guard"), truth_bias=0.4),
    IntelTemplate("rum_tunnel_smell", "rumor",
        "Из вентиляции блока {block} тянет сырой землёй.",
        audience=("prisoner",), truth_bias=0.6),
    IntelTemplate("rum_tunnel_no_camera", "rumor",
        "В камере {cell} камера наблюдения молчит уже сутки.",
        audience=("prisoner", "guard", "boss"), truth_bias=0.5),

    # --- Warnings (for guards mostly) --------------------------------------
    IntelTemplate("warn_dig_overnight", "warning",
        "За ночь блок {block} вёл подкоп больше обычного.",
        audience=("guard", "authority"), truth_bias=0.85),
    IntelTemplate("warn_radio_chatter", "warning",
        "Зэки в блоке {block} слушают какой-то радиоканал.",
        audience=("guard",), truth_bias=0.6),
    IntelTemplate("warn_visitor_run", "warning",
        "{nick} весь день мотается от камеры к камере.",
        audience=("guard", "authority"), truth_bias=0.7),
    IntelTemplate("warn_kitchen_stash", "warning",
        "На кухне видели подозрительную свёртку — возможно, паёк-схрон.",
        audience=("guard",), truth_bias=0.5),
    IntelTemplate("warn_lockpick_practice", "warning",
        "В блоке {block} в стенах нашли царапины от подбора замка.",
        audience=("guard", "authority"), truth_bias=0.55),

    # --- Secrets (authority + boss) ----------------------------------------
    IntelTemplate("sec_traitor", "secret",
        "Среди {faction}ов есть стукач — берегитесь {nick}.",
        audience=("authority", "boss"), truth_bias=0.65),
    IntelTemplate("sec_spy_in_block", "secret",
        "В блоке {block} ходит спайер. Кто — пока неясно.",
        audience=("authority", "boss"), truth_bias=0.7),
    IntelTemplate("sec_planted_evidence", "secret",
        "Кто-то подкинул в шкафчик {nick} перочинный нож.",
        audience=("authority", "guard"), truth_bias=0.55),
    IntelTemplate("sec_boss_message", "secret",
        "По камерам прошёл шифрованный приказ. Источник — {role}.",
        audience=("boss", "spy"), truth_bias=0.8),
    IntelTemplate("sec_double_agent", "secret",
        "{nick} говорит одно охране и другое сокамерникам.",
        audience=("authority", "boss"), truth_bias=0.5),

    # --- Leaks (spies + selective audiences) -------------------------------
    IntelTemplate("leak_alliance", "leak",
        "Между {nick} и кое-кем заключён пакт.",
        audience=("spy", "boss", "authority"), truth_bias=0.7),
    IntelTemplate("leak_market_corner", "leak",
        "{nick} скупает {block}-{cell} на чёрном рынке — готовится к чему-то.",
        audience=("spy", "boss"), truth_bias=0.6),
    IntelTemplate("leak_role_hint", "leak",
        "У {nick} татуировка не совпадает с заявленной статьёй.",
        audience=("spy", "authority"), truth_bias=0.55),
    IntelTemplate("leak_guard_bribed", "leak",
        "Охранника {nick} видели в обмен записками с зэками.",
        audience=("spy", "authority", "boss"), truth_bias=0.5),
    IntelTemplate("leak_authority_split", "leak",
        "Авторитет {nick} больше не контролирует свой блок.",
        audience=("spy", "boss"), truth_bias=0.55),

    # --- Tips (prisoners) --------------------------------------------------
    IntelTemplate("tip_visit_window", "tip",
        "После обеда камеры наблюдения в блоке {block} не пишут 8 минут.",
        audience=("prisoner",), truth_bias=0.75),
    IntelTemplate("tip_resource_drop", "tip",
        "На прогулке в камень засунули три железки — найди первым.",
        audience=("prisoner",), truth_bias=0.65),
    IntelTemplate("tip_safe_dig", "tip",
        "Сегодня патруль в блоке {block} ослаб — копать безопаснее.",
        audience=("prisoner", "boss"), truth_bias=0.6),
    IntelTemplate("tip_market_buyer", "tip",
        "{nick} даёт двойную цену за крюк.",
        audience=("prisoner",), truth_bias=0.7),
    IntelTemplate("tip_radio_freq", "tip",
        "Охрана сегодня болтает на 144.6 МГц — радио ловит.",
        audience=("prisoner",), truth_bias=0.5),

    # --- Cross-cutting / Final Night build-up ------------------------------
    IntelTemplate("xc_grand_plan", "rumor",
        "Кто-то готовит большой ход на ночь финала.",
        audience=("prisoner", "guard", "authority", "spy", "boss"), truth_bias=0.6),
    IntelTemplate("xc_warden_visit", "warning",
        "Завтра приезжает начальник тюрьмы. Все шмоны усилены.",
        audience=("guard", "authority"), truth_bias=0.85),
    IntelTemplate("xc_riot_setup", "rumor",
        "В блоке {block} зреет бунт — собирают железки.",
        audience=("prisoner", "guard"), truth_bias=0.55),
    IntelTemplate("xc_camera_blind", "tip",
        "Камера в коридоре {block}-3 уже сутки не пишет звук.",
        audience=("prisoner", "spy"), truth_bias=0.8),
    IntelTemplate("xc_authority_meet", "secret",
        "Авторитеты собирались ночью — что-то решали.",
        audience=("spy", "boss", "guard"), truth_bias=0.7),
    IntelTemplate("xc_old_grudge", "rumor",
        "{nick} имеет старый счёт с одним из охраны.",
        audience=("prisoner", "boss"), truth_bias=0.5),
    IntelTemplate("xc_supply_run", "tip",
        "Сегодня привезли скоропортящееся — рынок сегодня дешёвый.",
        audience=("prisoner",), truth_bias=0.7),
]


# ---------------------------------------------------------------------------
# Core rendering
# ---------------------------------------------------------------------------


def _render_template(
    tpl: IntelTemplate,
    *,
    nick_pool: Sequence[str],
    block_pool: Sequence[str],
    cell_pool: Sequence[str],
    role_pool: Sequence[str],
    faction_pool: Sequence[str],
    rng: random.Random,
) -> str:
    """Substitute placeholders. Pools must be non-empty."""
    text = tpl.text
    if "{nick}" in text and nick_pool:
        text = text.replace("{nick}", rng.choice(list(nick_pool)))
    if "{block}" in text and block_pool:
        text = text.replace("{block}", rng.choice(list(block_pool)))
    if "{cell}" in text and cell_pool:
        text = text.replace("{cell}", rng.choice(list(cell_pool)))
    if "{role}" in text and role_pool:
        text = text.replace("{role}", rng.choice(list(role_pool)))
    if "{faction}" in text and faction_pool:
        text = text.replace("{faction}", rng.choice(list(faction_pool)))
    return text


# ---------------------------------------------------------------------------
# Daily generation
# ---------------------------------------------------------------------------


async def daily_distribute(
    db: AsyncSession,
    event: PrisonBreakEvent,
    *,
    seed: int | None = None,
) -> dict[str, int]:
    """Generate a batch of intel for `event` and distribute it to players.

    Idempotency: we tag the seed by `event.id + event.current_day`, so calling
    twice on the same day re-generates nothing (we count existing rows for
    today and only top up to the target per-player count).

    Returns: {"generated": N, "delivered": M}
    """
    rng = random.Random(seed if seed is not None else (event.id * 100 + event.current_day))

    players = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.event_id == event.id,
            PrisonBreakPlayer.status == "active",
        )
    )).scalars().all()
    if not players:
        return {"generated": 0, "delivered": 0}

    cells = (await db.execute(
        select(PrisonBreakCell).where(PrisonBreakCell.event_id == event.id)
    )).scalars().all()

    by_role: dict[str, list[PrisonBreakPlayer]] = {}
    for p in players:
        by_role.setdefault(p.role or "prisoner", []).append(p)

    nick_pool = [p.nickname for p in players]
    block_pool = sorted({p.block for p in players if p.block}) or ["A"]
    cell_pool = [f"{c.block}-{c.number}" for c in cells] or ["A-1"]
    role_pool = sorted(by_role.keys()) or ["prisoner"]
    faction_pool = sorted({p.faction for p in players if p.faction}) or ["prisoner"]

    # Per-role per-day budgets — small numbers so the feed stays readable.
    budgets: dict[str, tuple[int, tuple[str, ...]]] = {
        "prisoner": (2, ("rumor", "tip")),
        "guard":    (2, ("warning", "leak")),
        "authority": (2, ("secret", "rumor")),
        "spy":      (3, ("leak", "secret", "rumor")),
        "boss":     (3, ("secret", "leak", "warning")),
    }

    today = event.current_day
    generated = 0
    delivered = 0

    for player in players:
        role = player.role or "prisoner"
        per_day, categories = budgets.get(role, (2, ("rumor",)))
        existing = (await db.execute(
            select(func.count()).select_from(PrisonBreakIntelView)
            .join(PrisonBreakIntel, PrisonBreakIntel.id == PrisonBreakIntelView.intel_id)
            .where(
                PrisonBreakIntelView.viewer_id == player.id,
                func.date(PrisonBreakIntelView.received_at) == func.date(func.now()),
            )
        )).scalar() or 0
        need = max(0, per_day - existing)

        for _ in range(need):
            # Pick a template biased by player's role
            candidates = [
                t for t in INTEL_TEMPLATES
                if (role in t.audience) and (t.category in categories)
            ]
            if not candidates:
                candidates = [t for t in INTEL_TEMPLATES if role in t.audience]
            if not candidates:
                candidates = INTEL_TEMPLATES
            tpl = rng.choice(candidates)

            content = _render_template(
                tpl,
                nick_pool=[n for n in nick_pool if n != player.nickname] or nick_pool,
                block_pool=block_pool,
                cell_pool=cell_pool,
                role_pool=role_pool,
                faction_pool=faction_pool,
                rng=rng,
            )
            is_truth = rng.random() < tpl.truth_bias
            fabricated = False
            source_role: str | None = None
            source_user_id: int | None = None
            # Spies/bosses sometimes plant fabricated leaks (forces info-warfare)
            if tpl.category in ("leak", "secret") and rng.random() < 0.12:
                fabricated = True
                is_truth = False
                # Tag as if planted by a random non-target source
                planters = by_role.get("spy", []) + by_role.get("boss", [])
                if planters:
                    p = rng.choice(planters)
                    source_role = p.role
                    source_user_id = p.id

            intel = PrisonBreakIntel(
                event_id=event.id,
                content=content,
                is_truth=is_truth,
                category=tpl.category,
                source_role=source_role,
                source_user_id=source_user_id,
                fabricated=fabricated,
            )
            db.add(intel)
            await db.flush()
            generated += 1

            view = PrisonBreakIntelView(
                intel_id=intel.id,
                viewer_id=player.id,
                forwarded_from_id=None,
            )
            db.add(view)
            delivered += 1

    return {"generated": generated, "delivered": delivered}


# ---------------------------------------------------------------------------
# Forwarding
# ---------------------------------------------------------------------------


async def forward_to(
    db: AsyncSession,
    forwarder: PrisonBreakPlayer,
    intel_id: int,
    target_player_id: int,
) -> PrisonBreakIntelView:
    """Forward one intel atom to another player.

    Rules:
      * Forwarder must have already seen the intel.
      * Target must be in the same event and not eliminated.
      * Target must not already have a view of this intel.
      * Trust between forwarder and target +2 (capped at 100).
    """
    if forwarder.id == target_player_id:
        raise ValueError("cannot forward to self")

    own_view = (await db.execute(
        select(PrisonBreakIntelView).where(
            PrisonBreakIntelView.intel_id == intel_id,
            PrisonBreakIntelView.viewer_id == forwarder.id,
        )
    )).scalar_one_or_none()
    if own_view is None:
        raise PermissionError("forwarder has not received this intel")

    target = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.id == target_player_id,
            PrisonBreakPlayer.event_id == forwarder.event_id,
            PrisonBreakPlayer.status == "active",
        )
    )).scalar_one_or_none()
    if target is None:
        raise ValueError("target not found")

    existing = (await db.execute(
        select(PrisonBreakIntelView).where(
            PrisonBreakIntelView.intel_id == intel_id,
            PrisonBreakIntelView.viewer_id == target_player_id,
        )
    )).scalar_one_or_none()
    if existing is not None:
        return existing

    view = PrisonBreakIntelView(
        intel_id=intel_id,
        viewer_id=target_player_id,
        forwarded_from_id=forwarder.id,
    )
    db.add(view)

    # Trust bump (+2, capped at 100)
    a, b = sorted([forwarder.id, target_player_id])
    tr = (await db.execute(
        select(PrisonBreakTrust).where(
            PrisonBreakTrust.event_id == forwarder.event_id,
            PrisonBreakTrust.user_a == a,
            PrisonBreakTrust.user_b == b,
        )
    )).scalar_one_or_none()
    if tr is None:
        tr = PrisonBreakTrust(
            event_id=forwarder.event_id, user_a=a, user_b=b, score=52,
        )
        db.add(tr)
    else:
        tr.score = min(100, tr.score + 2)
        tr.last_change_at = datetime.now(UTC)

    return view


# ---------------------------------------------------------------------------
# Read helpers — used by router to feed the UI
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IntelFeedItem:
    intel_id: int
    content: str
    category: str
    is_truth_visible: bool  # whether we tell client truthiness (admin/post-Final-Night)
    is_truth: bool | None
    fabricated: bool | None
    received_at: datetime
    forwarded_from_id: int | None
    source_role: str | None  # only for own observations


async def list_for_player(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    *,
    limit: int = 50,
    reveal_truth: bool = False,
) -> list[IntelFeedItem]:
    """Return the player's intel feed, newest first."""
    rows = await db.execute(
        select(PrisonBreakIntel, PrisonBreakIntelView)
        .join(
            PrisonBreakIntelView,
            and_(
                PrisonBreakIntelView.intel_id == PrisonBreakIntel.id,
                PrisonBreakIntelView.viewer_id == player.id,
            ),
        )
        .order_by(PrisonBreakIntelView.received_at.desc())
        .limit(min(200, limit))
    )
    out: list[IntelFeedItem] = []
    for intel, view in rows.all():
        out.append(IntelFeedItem(
            intel_id=intel.id,
            content=intel.content,
            category=intel.category,
            is_truth_visible=reveal_truth,
            is_truth=intel.is_truth if reveal_truth else None,
            fabricated=intel.fabricated if reveal_truth else None,
            received_at=view.received_at,
            forwarded_from_id=view.forwarded_from_id,
            source_role=intel.source_role if reveal_truth else None,
        ))
    return out
