"""prison_break — arena 2D fighter engine (server-authoritative).

Single-process in-memory engine. Each active match owns one
`ArenaMatch` object. The match runs as an async task ticking at
`TICK_HZ` frames per second. State after each tick is broadcast to
all registered subscriber queues. Player inputs come in over HTTP and
are enqueued into the match's input queue.

State model
───────────
Stage: 800 × 240 logical units (px on the client). Floor at y=240. No
walls — players who walk off the edge teleport back. Z axis ignored;
this is a side-scrolling brawler.

Each fighter has:
  x, vx           position + velocity (px, px/sec)
  facing          +1 right, -1 left
  hp              0..100
  stamina         0..100, regen 12/sec while idle, 0/sec while attacking
  action          {"idle", "moving", "startup", "active", "recovery",
                   "stunned", "blocking", "parry_window"}
  action_slug     specials slug if action != idle/moving/stunned/blocking
  frame_left      ticks until the current action's next phase
  cooldowns       {special_slug: ticks_remaining}

Combat resolution
─────────────────
On an "active" frame for an attacker:
  Hitbox = rect anchored at attacker.x + facing*range_offset,
           extending forward by `range`. Height ∈ {low, mid, high}.
  If defender's x falls in the box AND not parry_window AND not blocking
  the matching height → defender takes damage.
  Defender pushed back by `knockback_x` proportional to damage.
  Defender goes into "stunned" for `hit_stun_ticks`.
  Parry: if defender used the parry special and is in parry_window and
  the incoming attack's first hit lands during that window → attacker
  goes into "recovery" doubled, takes 5% of damage themselves.

Specials catalog: see SPECIALS dict. Twelve moves. Each has frame data.

Win conditions
──────────────
  • hp drops to 0
  • match timer (90s) — winner is the one with more hp; tie ⇒ longest
    facing-attack streak wins; second tie ⇒ a coin flip stored in seed
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from collections.abc import AsyncGenerator
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

log = logging.getLogger("prison_break.arena")


# ---------------------------------------------------------------------------
# Tuning
# ---------------------------------------------------------------------------

TICK_HZ = 15
TICK_DT = 1.0 / TICK_HZ
STAGE_W = 800
STAGE_H = 240
FLOOR_Y = STAGE_H  # players sit on floor
FIGHTER_W = 40
FIGHTER_H = 80
MOVE_SPEED = 220.0  # px/sec
MATCH_DURATION_SEC = 90
STAMINA_REGEN_PER_SEC = 12.0
HP_MAX = 100
STAMINA_MAX = 100


@dataclass(frozen=True)
class Special:
    slug: str
    name: str
    emoji: str
    description: str
    stamina_cost: int
    damage: int
    range: int  # px the hitbox extends in front of attacker
    height: str  # "low" | "mid" | "high"
    startup_ticks: int
    active_ticks: int
    recovery_ticks: int
    cooldown_ticks: int
    knockback_x: float  # px applied to defender on hit
    hit_stun_ticks: int
    parry: bool = False  # if True, this is a parry move (special-cased)
    dash: bool = False   # if True, attacker dashes forward during startup
    dash_speed: float = 0.0
    self_recoil: float = 0.0  # self-knockback on whiff


SPECIALS: dict[str, Special] = {
    "punch_jab": Special(
        slug="punch_jab", name="Прямой удар", emoji="👊",
        description="Базовый джеб. Быстрый, дешёвый, короткий.",
        stamina_cost=10, damage=8, range=44, height="mid",
        startup_ticks=2, active_ticks=2, recovery_ticks=3,
        cooldown_ticks=4, knockback_x=12.0, hit_stun_ticks=4,
    ),
    "punch_hook": Special(
        slug="punch_hook", name="Хук", emoji="🥊",
        description="Боковой удар. Шире джеба, чуть дольше.",
        stamina_cost=15, damage=12, range=52, height="mid",
        startup_ticks=4, active_ticks=3, recovery_ticks=5,
        cooldown_ticks=8, knockback_x=24.0, hit_stun_ticks=6,
    ),
    "kick_round": Special(
        slug="kick_round", name="Удар ногой", emoji="🦵",
        description="Круговой удар. Больно, не дёшево.",
        stamina_cost=20, damage=16, range=60, height="mid",
        startup_ticks=5, active_ticks=3, recovery_ticks=6,
        cooldown_ticks=10, knockback_x=30.0, hit_stun_ticks=7,
    ),
    "throw_grab": Special(
        slug="throw_grab", name="Бросок", emoji="🤼",
        description="Захват + бросок. Игнорит парирование.",
        stamina_cost=22, damage=14, range=38, height="mid",
        startup_ticks=3, active_ticks=2, recovery_ticks=8,
        cooldown_ticks=18, knockback_x=80.0, hit_stun_ticks=12,
    ),
    "shiv_strike": Special(
        slug="shiv_strike", name="Заточка", emoji="🔪",
        description="Зэковский удар заточкой. Большой урон, медленный recovery.",
        stamina_cost=18, damage=22, range=40, height="mid",
        startup_ticks=4, active_ticks=2, recovery_ticks=10,
        cooldown_ticks=20, knockback_x=18.0, hit_stun_ticks=5,
    ),
    "bat_swing": Special(
        slug="bat_swing", name="Биткой", emoji="🏏",
        description="Замах битой. Большой хитбокс, средний урон.",
        stamina_cost=22, damage=18, range=70, height="high",
        startup_ticks=6, active_ticks=4, recovery_ticks=8,
        cooldown_ticks=15, knockback_x=40.0, hit_stun_ticks=8,
    ),
    "charge_run": Special(
        slug="charge_run", name="С разбега", emoji="🏃",
        description="Разбег + удар. Сам летишь на цель.",
        stamina_cost=25, damage=20, range=46, height="mid",
        startup_ticks=8, active_ticks=3, recovery_ticks=6,
        cooldown_ticks=22, knockback_x=50.0, hit_stun_ticks=8,
        dash=True, dash_speed=420.0,
    ),
    "sweep_low": Special(
        slug="sweep_low", name="Подсечка", emoji="🦶",
        description="Низкий мах ногой. Сбивает с ног.",
        stamina_cost=18, damage=10, range=58, height="low",
        startup_ticks=4, active_ticks=2, recovery_ticks=7,
        cooldown_ticks=14, knockback_x=10.0, hit_stun_ticks=14,
    ),
    "parry": Special(
        slug="parry", name="Перехват", emoji="🛡️",
        description="Краткое окно парирования. Следующий удар возвращается.",
        stamina_cost=12, damage=0, range=0, height="mid",
        startup_ticks=1, active_ticks=4, recovery_ticks=6,
        cooldown_ticks=12, knockback_x=0.0, hit_stun_ticks=0,
        parry=True,
    ),
    "wild_haymaker": Special(
        slug="wild_haymaker", name="Дикий замах", emoji="💥",
        description="Огромный замах. Если попадёшь — пол hp срежешь.",
        stamina_cost=35, damage=42, range=56, height="high",
        startup_ticks=14, active_ticks=2, recovery_ticks=18,
        cooldown_ticks=40, knockback_x=80.0, hit_stun_ticks=20,
        self_recoil=20.0,
    ),
    "psycho_dash": Special(
        slug="psycho_dash", name="Псих-рывок", emoji="⚡",
        description="Резкий рывок к цели. Лёгкий хит.",
        stamina_cost=14, damage=6, range=38, height="mid",
        startup_ticks=2, active_ticks=2, recovery_ticks=4,
        cooldown_ticks=10, knockback_x=14.0, hit_stun_ticks=4,
        dash=True, dash_speed=520.0,
    ),
    "feint": Special(
        slug="feint", name="Финт", emoji="🌀",
        description="Обманка. Урона нет, но кулдауны сбрасываются.",
        stamina_cost=6, damage=0, range=0, height="mid",
        startup_ticks=2, active_ticks=1, recovery_ticks=2,
        cooldown_ticks=6, knockback_x=0.0, hit_stun_ticks=0,
    ),
}

LOADOUT_SIZE = 3


# ---------------------------------------------------------------------------
# Fighter state
# ---------------------------------------------------------------------------


@dataclass
class Fighter:
    player_id: int
    nickname: str
    tattoo: str
    loadout: list[str]
    side: str  # "a" | "b"
    x: float
    vx: float
    facing: int  # +1 right, -1 left
    hp: int
    stamina: float
    action: str
    action_slug: str | None
    frame_left: int
    cooldowns: dict[str, int]
    move_intent: int  # -1 left, 0 idle, +1 right
    block_intent: str | None  # "low" | "mid" | "high" | None
    queued_special: str | None
    landed_hits: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "player_id": self.player_id,
            "nickname": self.nickname,
            "tattoo": self.tattoo,
            "loadout": list(self.loadout),
            "side": self.side,
            "x": round(self.x, 1),
            "vx": round(self.vx, 1),
            "facing": self.facing,
            "hp": self.hp,
            "stamina": round(self.stamina, 1),
            "action": self.action,
            "action_slug": self.action_slug,
            "frame_left": self.frame_left,
            "cooldowns": dict(self.cooldowns),
            "landed_hits": self.landed_hits,
        }


# ---------------------------------------------------------------------------
# Match
# ---------------------------------------------------------------------------


@dataclass
class ArenaEvent:
    kind: str  # "hit" | "miss" | "parry" | "ko" | "tick" | "start" | "end"
    tick: int
    payload: dict[str, Any]


class ArenaMatch:
    """In-memory match state + ticker."""

    def __init__(
        self,
        match_id: int,
        event_id: int,
        fighter_a: Fighter,
        fighter_b: Fighter,
        seed: int | None = None,
    ) -> None:
        self.match_id = match_id
        self.event_id = event_id
        self.fighters: dict[str, Fighter] = {"a": fighter_a, "b": fighter_b}
        self.tick = 0
        self.max_ticks = MATCH_DURATION_SEC * TICK_HZ
        self.finished = False
        self.winner_side: str | None = None
        self.events: list[ArenaEvent] = []
        self.frames: list[dict[str, Any]] = []
        self.subscribers: list[asyncio.Queue[dict[str, Any]]] = []
        self.input_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self.started_at = datetime.now(UTC)
        self.ended_at: datetime | None = None
        self.rng = random.Random(seed if seed is not None else int(time.time() * 1000))

    # ------------------------------------------------------------------
    # Subscriber API
    # ------------------------------------------------------------------

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        self.subscribers.append(q)
        # Push the current state immediately so the new subscriber catches up.
        try:
            q.put_nowait(self.snapshot(kind="hello"))
        except asyncio.QueueFull:
            pass
        return q

    def unsubscribe(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        try:
            self.subscribers.remove(q)
        except ValueError:
            pass

    def push_input(self, payload: dict[str, Any]) -> None:
        try:
            self.input_queue.put_nowait(payload)
        except asyncio.QueueFull:
            log.warning("arena %s input queue full; dropping", self.match_id)

    def start(self) -> None:
        if self._task is None and not self.finished:
            self._task = asyncio.create_task(self._run())
            self._broadcast(self.snapshot(kind="start"))

    async def stop(self) -> None:
        self.finished = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _run(self) -> None:
        try:
            while not self.finished and self.tick < self.max_ticks:
                await asyncio.sleep(TICK_DT)
                self._drain_inputs()
                self._step()
                if self._broadcast_due():
                    self._broadcast(self.snapshot(kind="tick"))
                self.tick += 1
            # Timeout resolution
            if not self.finished:
                self._timeout_resolve()
            self._broadcast(self.snapshot(kind="end"))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — engine never crashes the process
            log.exception("arena %s engine crashed", self.match_id)
            self.finished = True
            self._broadcast(self.snapshot(kind="end"))

    def _broadcast_due(self) -> bool:
        # Push every 2 ticks (≈ 7.5 Hz) to keep WS traffic modest.
        return self.tick % 2 == 0 or self.finished

    def _broadcast(self, snap: dict[str, Any]) -> None:
        dead: list[asyncio.Queue] = []
        for q in self.subscribers:
            try:
                q.put_nowait(snap)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            try:
                self.subscribers.remove(q)
            except ValueError:
                pass

    def _drain_inputs(self) -> None:
        while True:
            try:
                msg = self.input_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            self._apply_input(msg)

    def _apply_input(self, msg: dict[str, Any]) -> None:
        side = msg.get("side")
        if side not in self.fighters:
            return
        f = self.fighters[side]
        t = msg.get("type")
        if t == "move":
            try:
                dx = int(msg.get("dx", 0))
            except (TypeError, ValueError):
                return
            f.move_intent = max(-1, min(1, dx))
        elif t == "block":
            height = msg.get("height")
            if height in (None, "low", "mid", "high"):
                f.block_intent = height
        elif t == "special":
            slug = msg.get("slug")
            if slug not in SPECIALS:
                return
            if slug not in f.loadout:
                return
            # Queue special only if actor is idle/moving and cooldown 0.
            if f.action in ("idle", "moving"):
                spec = SPECIALS[slug]
                cd = f.cooldowns.get(slug, 0)
                if cd > 0:
                    return
                if f.stamina < spec.stamina_cost:
                    return
                f.queued_special = slug

    # ------------------------------------------------------------------
    # Tick logic
    # ------------------------------------------------------------------

    def _step(self) -> None:
        for f in self.fighters.values():
            # Tick cooldowns
            for k in list(f.cooldowns.keys()):
                f.cooldowns[k] = max(0, f.cooldowns[k] - 1)
                if f.cooldowns[k] == 0:
                    del f.cooldowns[k]

            # Stamina regen when not attacking
            if f.action in ("idle", "moving", "blocking", "stunned"):
                f.stamina = min(STAMINA_MAX, f.stamina + STAMINA_REGEN_PER_SEC * TICK_DT)

            # Block decay if no intent
            if f.action == "blocking" and not f.block_intent:
                f.action = "idle"

            # Begin queued special
            if f.queued_special and f.action in ("idle", "moving"):
                self._start_special(f, f.queued_special)
                f.queued_special = None

        # Advance action frames + apply physics
        for f in self.fighters.values():
            spec = SPECIALS.get(f.action_slug) if f.action_slug else None
            if f.action == "startup":
                if spec and spec.dash:
                    f.vx = spec.dash_speed * f.facing
                f.frame_left -= 1
                if f.frame_left <= 0:
                    # Transition into active phase AND resolve the hit
                    # exactly once on the same tick.
                    f.action = "active"
                    f.frame_left = spec.active_ticks if spec else 0
                    if spec:
                        self._resolve_hit(f, spec)
            elif f.action == "active":
                f.frame_left -= 1
                if f.frame_left <= 0:
                    f.action = "recovery"
                    f.frame_left = spec.recovery_ticks if spec else 0
            elif f.action == "recovery":
                f.frame_left -= 1
                if f.frame_left <= 0:
                    f.action = "idle"
                    f.action_slug = None
            elif f.action == "stunned":
                f.frame_left -= 1
                if f.frame_left <= 0:
                    f.action = "idle"
            elif f.action == "parry_window":
                f.frame_left -= 1
                if f.frame_left <= 0:
                    f.action = "recovery"
                    if spec:
                        f.frame_left = spec.recovery_ticks
                    else:
                        f.frame_left = 0

            if f.action in ("idle", "moving"):
                if f.move_intent != 0:
                    f.action = "moving"
                    f.vx = MOVE_SPEED * f.move_intent
                    f.facing = 1 if f.move_intent > 0 else -1
                else:
                    f.action = "idle"
                    f.vx = 0
                if f.block_intent:
                    f.action = "blocking"
                    f.vx = 0

        # Integrate position
        for f in self.fighters.values():
            f.x += f.vx * TICK_DT
            # Decay velocity from knockback / dash
            if f.action in ("recovery", "stunned"):
                f.vx *= 0.85
            # Stage clamp
            f.x = max(FIGHTER_W / 2, min(STAGE_W - FIGHTER_W / 2, f.x))

        # Auto-face opponent when idle
        for side, f in self.fighters.items():
            other = self.fighters["b" if side == "a" else "a"]
            if f.action in ("idle", "moving") and not f.move_intent:
                f.facing = 1 if other.x > f.x else -1

        # Check KO
        for side, f in self.fighters.items():
            if f.hp <= 0 and not self.finished:
                self.winner_side = "b" if side == "a" else "a"
                self.finished = True
                self.ended_at = datetime.now(UTC)
                self.events.append(ArenaEvent(
                    kind="ko",
                    tick=self.tick,
                    payload={"winner_side": self.winner_side, "loser_side": side},
                ))
                return

    def _start_special(self, f: Fighter, slug: str) -> None:
        spec = SPECIALS[slug]
        f.stamina -= spec.stamina_cost
        f.cooldowns[slug] = spec.cooldown_ticks
        if spec.parry:
            f.action = "parry_window"
            f.action_slug = slug
            f.frame_left = spec.active_ticks
            self.events.append(ArenaEvent(
                kind="parry_open", tick=self.tick,
                payload={"side": f.side, "slug": slug},
            ))
            return
        if slug == "feint":
            # Feint resets all cooldowns.
            f.cooldowns.clear()
            f.action = "recovery"
            f.action_slug = slug
            f.frame_left = spec.recovery_ticks
            self.events.append(ArenaEvent(
                kind="feint", tick=self.tick,
                payload={"side": f.side},
            ))
            return
        f.action = "startup"
        f.action_slug = slug
        f.frame_left = spec.startup_ticks

    def _resolve_hit(self, attacker: Fighter, spec: Special) -> None:
        defender_side = "b" if attacker.side == "a" else "a"
        defender = self.fighters[defender_side]

        # Hitbox: anchor at attacker.x + facing * (FIGHTER_W/2 + range/2),
        # extends by `range` along x, height-checked vs block intent.
        attack_x = attacker.x + attacker.facing * (FIGHTER_W / 2)
        attack_end = attack_x + attacker.facing * spec.range
        x0, x1 = sorted([attack_x, attack_end])
        defender_left = defender.x - FIGHTER_W / 2
        defender_right = defender.x + FIGHTER_W / 2

        in_range = not (defender_right < x0 or defender_left > x1)

        # Parry check
        if (
            in_range
            and defender.action == "parry_window"
            and not spec.parry
            and spec.slug != "throw_grab"
        ):
            # Parry succeeds — attacker eats recovery + small self-damage.
            self_dmg = max(1, spec.damage // 5)
            attacker.hp = max(0, attacker.hp - self_dmg)
            attacker.action = "recovery"
            attacker.frame_left = spec.recovery_ticks * 2
            attacker.vx = -spec.knockback_x * attacker.facing * 0.6
            defender.action = "idle"
            defender.action_slug = None
            self.events.append(ArenaEvent(
                kind="parry", tick=self.tick,
                payload={
                    "attacker_side": attacker.side,
                    "defender_side": defender_side,
                    "self_damage": self_dmg,
                },
            ))
            return

        if not in_range:
            self.events.append(ArenaEvent(
                kind="miss", tick=self.tick,
                payload={"side": attacker.side, "slug": spec.slug},
            ))
            if spec.self_recoil:
                attacker.vx = -spec.self_recoil * attacker.facing
            return

        # Block check — defender must match height; throw_grab ignores blocks.
        if (
            defender.action == "blocking"
            and defender.block_intent == spec.height
            and spec.slug != "throw_grab"
        ):
            self.events.append(ArenaEvent(
                kind="block", tick=self.tick,
                payload={"side": attacker.side, "defender_side": defender_side},
            ))
            defender.vx = spec.knockback_x * (1 if attacker.facing > 0 else -1) * 0.3
            return

        # Land
        defender.hp = max(0, defender.hp - spec.damage)
        defender.vx = spec.knockback_x * (1 if attacker.facing > 0 else -1)
        defender.action = "stunned"
        defender.frame_left = spec.hit_stun_ticks
        attacker.landed_hits += 1
        self.events.append(ArenaEvent(
            kind="hit", tick=self.tick,
            payload={
                "attacker_side": attacker.side,
                "defender_side": defender_side,
                "slug": spec.slug,
                "damage": spec.damage,
                "hp_after": defender.hp,
            },
        ))

    def _timeout_resolve(self) -> None:
        self.finished = True
        self.ended_at = datetime.now(UTC)
        a = self.fighters["a"]
        b = self.fighters["b"]
        if a.hp > b.hp:
            self.winner_side = "a"
        elif b.hp > a.hp:
            self.winner_side = "b"
        elif a.landed_hits > b.landed_hits:
            self.winner_side = "a"
        elif b.landed_hits > a.landed_hits:
            self.winner_side = "b"
        else:
            self.winner_side = self.rng.choice(["a", "b"])
        self.events.append(ArenaEvent(
            kind="timeout", tick=self.tick,
            payload={"winner_side": self.winner_side},
        ))

    # ------------------------------------------------------------------
    # Snapshot
    # ------------------------------------------------------------------

    def snapshot(self, *, kind: str = "tick") -> dict[str, Any]:
        snap = {
            "kind": kind,
            "match_id": self.match_id,
            "tick": self.tick,
            "max_ticks": self.max_ticks,
            "stage": {"w": STAGE_W, "h": STAGE_H},
            "fighters": {
                "a": self.fighters["a"].to_dict(),
                "b": self.fighters["b"].to_dict(),
            },
            "finished": self.finished,
            "winner_side": self.winner_side,
            "winner_id": (
                self.fighters[self.winner_side].player_id
                if self.winner_side else None
            ),
            "recent_events": [
                {"kind": e.kind, "tick": e.tick, "payload": e.payload}
                for e in self.events[-10:]
            ],
        }
        if kind in ("tick", "start"):
            self.frames.append({
                "tick": self.tick,
                "a": self.fighters["a"].to_dict(),
                "b": self.fighters["b"].to_dict(),
            })
        return snap


# ---------------------------------------------------------------------------
# Registry — process-local pool of active matches
# ---------------------------------------------------------------------------


_REGISTRY: dict[int, ArenaMatch] = {}


def register(match: ArenaMatch) -> None:
    _REGISTRY[match.match_id] = match


def unregister(match_id: int) -> None:
    _REGISTRY.pop(match_id, None)


def get(match_id: int) -> ArenaMatch | None:
    return _REGISTRY.get(match_id)


def list_active() -> list[ArenaMatch]:
    return list(_REGISTRY.values())


def make_fighter(
    player_id: int,
    nickname: str,
    tattoo: str,
    loadout: list[str],
    side: str,
) -> Fighter:
    """Build a fresh Fighter at the side's spawn position."""
    if side == "a":
        x0 = STAGE_W * 0.30
        facing = 1
    else:
        x0 = STAGE_W * 0.70
        facing = -1
    return Fighter(
        player_id=player_id,
        nickname=nickname,
        tattoo=tattoo,
        loadout=list(loadout),
        side=side,
        x=x0,
        vx=0.0,
        facing=facing,
        hp=HP_MAX,
        stamina=STAMINA_MAX,
        action="idle",
        action_slug=None,
        frame_left=0,
        cooldowns={},
        move_intent=0,
        block_intent=None,
        queued_special=None,
        landed_hits=0,
    )


def specials_catalog() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in SPECIALS.values():
        out.append({
            "slug": s.slug,
            "name": s.name,
            "emoji": s.emoji,
            "description": s.description,
            "stamina_cost": s.stamina_cost,
            "damage": s.damage,
            "range": s.range,
            "height": s.height,
            "startup_ticks": s.startup_ticks,
            "active_ticks": s.active_ticks,
            "recovery_ticks": s.recovery_ticks,
            "cooldown_ticks": s.cooldown_ticks,
            "knockback_x": s.knockback_x,
            "parry": s.parry,
            "dash": s.dash,
        })
    return out
