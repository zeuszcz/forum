"""arcade — game catalog. In-process registry; one entry per game.

Adding a new game is two steps:
  1. Append a `GameConfig` here.
  2. Implement the client-side game logic in
     `frontend/src/app/arcade/_games/<slug>.ts`.

The server does:
  • issue a seed at start_run
  • validate the submitted final score against `max_score_per_second`
  • write the row + update leaderboard caches

All scoring rules + difficulty curves live on the client. The server
is authoritative only on rate-limit + sanity-curve + rate of progress.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GameConfig:
    slug: str
    title: str
    short: str            # one-liner for catalog tiles
    emoji: str
    accent: str           # tailwind color (text-flame / text-cyan / ...)
    description: str      # full UI blurb (Russian)
    controls: str         # what keys / mouse to use
    score_unit: str       # "depth", "wave", "seconds", "checkpoint"
    # Anti-cheat sanity gate — server rejects runs where
    # score / (duration_seconds + 1) > max_score_per_second.
    max_score_per_second: float
    # Minimum duration in ms — runs shorter than this are flagged.
    min_duration_ms: int
    # Hard upper-bound on a single run's score; anything above is bug/cheat.
    score_ceiling: int


GAMES: dict[str, GameConfig] = {
    "digger": GameConfig(
        slug="digger",
        title="Тоннель-копатель",
        short="Копай вниз. Уворачивайся от труб и камер.",
        emoji="⛏",
        accent="text-amber-400",
        description=(
            "Каждый клик — удар киркой. Падают камни, прорываются трубы, "
            "проезжают патрули. Глубже копаешь — выше счёт. Crowbar и "
            "лопата — для скорости. Камера наблюдения — мгновенный конец."
        ),
        controls="A/D или ←/→ — двигаться · SPACE/клик — копать вниз",
        score_unit="depth (м)",
        max_score_per_second=12.0,
        min_duration_ms=3000,
        score_ceiling=200_000,
    ),
    "spotlight": GameConfig(
        slug="spotlight",
        title="Беги от прожектора",
        short="Двор. Прожектора. Не свети.",
        emoji="🔦",
        accent="text-cyan",
        description=(
            "Тюремный двор сверху. Прожектора крутятся по своим траекториям. "
            "Зашёл в луч — реверт к старту, теряешь чекпоинт. Каждый "
            "чекпоинт — +1 к счёту. Игра бесконечна; чем дальше — тем "
            "больше прожекторов."
        ),
        controls="WASD или стрелки — движение по сетке",
        score_unit="checkpoints",
        max_score_per_second=4.0,
        min_duration_ms=2000,
        score_ceiling=10_000,
    ),
    "brawler": GameConfig(
        slug="brawler",
        title="Бунт в столовой",
        short="Бесконечные волны охраны. Ломай столы.",
        emoji="🥊",
        accent="text-rose-400",
        description=(
            "Ты — зэк в столовой. Охрана идёт волнами по 3-7 ботов. "
            "Удар / уворот / парирование. Каждая волна — новый счёт + "
            "одно случайное усиление. Умер — конец."
        ),
        controls="A/D — движение · J — удар · K — уворот · L — парировать",
        score_unit="wave",
        max_score_per_second=2.5,
        min_duration_ms=5000,
        score_ceiling=5_000,
    ),
    "runner": GameConfig(
        slug="runner",
        title="Бунтарь-раннер",
        short="Беги по коридору. Прыгай. Подкатывай.",
        emoji="🏃",
        accent="text-emerald-400",
        description=(
            "Тюремный коридор. Скорость нарастает. Барьеры — прыгай. "
            "Низкие трубы — подкат. Охрана — обходи. Score = метры до "
            "первого хита."
        ),
        controls="SPACE/↑ — прыжок · ↓/S — подкат",
        score_unit="distance (м)",
        max_score_per_second=20.0,
        min_duration_ms=2500,
        score_ceiling=500_000,
    ),
}


def get(slug: str) -> GameConfig | None:
    return GAMES.get(slug)


def all_games() -> list[GameConfig]:
    return list(GAMES.values())
