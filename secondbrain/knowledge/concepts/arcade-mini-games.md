---
title: Arcade — endless mini-games + monthly leaderboard rewards
tags: [arcade, leaderboard, mini-games, anticheat, monthly-rollover]
status: stable
updated: 2026-05-15
---

# Arcade module

Separate from the Prison Break event. Four always-available 2D
mini-games in jail aesthetic, single global leaderboard per game,
top-3 of each game frozen at month-end with karma + case-key payouts.

## Architecture

Client-authoritative simulation + server-side sanity gate. Server
issues a seed at run-start, client renders + simulates + tracks score
locally, end-of-run submission flows back through three anti-cheat
gates before counting toward leaderboard.

```
client                            server
─────                            ──────
POST /games/{slug}/start    ───►  issue seed; INSERT pending run
play game (60fps Canvas2D)
POST /games/{slug}/end      ───►  rate-limit + sanity-curve + ceiling
                                  → status='ended' or 'flagged'
                                  → compute rank_in_month/rank_all_time
                                  ◄ returns rank info to UI
```

### DB schema (migration 20260515_1000)

| Table | Role |
|-------|------|
| `arcade_run` | one row per run; replay JSON + `flagged_reason` |
| `arcade_monthly_winner` | frozen top-10 per game per month |
| `arcade_daily_bonus` | tracks daily karma-bonus streak |

Hot leaderboard queries use a partial index on
`(game_slug, score DESC) WHERE status='ended'` — fast top-N regardless
of how many flagged/cancelled rows exist.

### Files

```
backend/app/models/arcade.py
backend/app/services/arcade/
    games.py             — in-process catalog (no DB roundtrip)
    arcade_service.py    — start_run / end_run / leaderboards / my_stats /
                            daily_bonus_status / claim_daily_bonus /
                            hall_of_fame
    anticheat.py         — rate-limit + sanity-curve + score-ceiling gates
    monthly_freeze.py    — month-rollover snapshot + payouts
backend/app/routers/arcade.py    — 10 endpoints (HTTP only, no WS)
backend/app/schemas/arcade.py

frontend/src/app/arcade/
    page.tsx                       — catalog + daily bonus card + prize info
    hall-of-fame/page.tsx          — frozen monthly podiums (last 12 months)
    [slug]/page.tsx                — game switch by slug
    [slug]/leaders/page.tsx        — full leaderboard (top-100)
    [slug]/_games/
        GameShell.tsx              — shared start/end/leaderboard chrome
        DiggerGame.tsx             — ⛏ vertical scroller
        SpotlightGame.tsx          — 🔦 top-down grid stealth
        BrawlerGame.tsx            — 🥊 wave brawler
        RunnerGame.tsx             — 🏃 endless runner
    _components/
        useArcadeRun.ts            — start/end + mulberry32 seeded RNG
        Leaderboard.tsx            — month/all toggle, top-N display
```

## Anti-cheat (the three gates)

| Gate | Purpose | Implementation |
|------|---------|----------------|
| **rate-limit** | block bot spam | ≤ 6 ended/flagged runs per 60s per user |
| **sanity curve** | catch impossibly fast scores | `score / duration_seconds <= game.max_score_per_second` |
| **score ceiling** | absolute upper bound | `game.score_ceiling` (hard reject above) |

Failed gates → `status='flagged'` with a `flagged_reason` like
`rate_too_high:18.5` or `score_ceiling`. Flagged rows are excluded
from leaderboards but kept for audit.

Replay validation (re-simulating from input_log) is **not** done in v1.
The `replay` JSON column holds milestones + a capped input_log so a
future replay-validator can backfill verification.

## Game catalog (4 games, all in `services/arcade/games.py`)

| slug | title | unit | curve | ceiling |
|------|-------|------|-------|---------|
| digger | Тоннель-копатель | глубина (м) | 12.0/s | 200k |
| spotlight | Беги от прожектора | checkpoints | 4.0/s | 10k |
| brawler | Бунт в столовой | wave | 2.5/s | 5k |
| runner | Бунтарь-раннер | distance (м) | 20.0/s | 500k |

Adding a 5th game: append a `GameConfig` + drop a `<Slug>Game.tsx`
under `_games/` + add a `case "<slug>":` arm in `[slug]/page.tsx`.
No migration, no schema changes.

## Monthly rollover

```
POST /api/admin/arcade/finalise-month   (or cron-task at 00:05 on the 1st)

→ freeze_month(year_month or previous_year_month_str()):
    if already_frozen(ym):    return (idempotent no-op)
    for each game in catalog:
        board = leaderboard_month(slug, ym, limit=10)
        for entry in board:
            credit karma + case_keys per rank-tier
            if rank == 1: write title_grant on User + on the row
            INSERT arcade_monthly_winner (UNIQUE: year_month+slug+rank)
```

Payout tiers:

| Rank | Karma | Keys | Title (rank 1 only) |
|------|-------|------|--------------------|
| 1 | +2000 | +5 | "Король «<game>»" → `user.title` (overwrites previous) |
| 2 | +1000 | +3 | — |
| 3 | +500 | +1 | — |
| 4-10 | +100 | 0 | — |

Idempotency: `UNIQUE (year_month, game_slug, rank)` makes the freeze
a no-op on re-run. Cron can fire safely at 00:05 of every day-1.

## Daily bonus

Separate from monthly rewards. Players claim once per MSK day:
- Karma: `10 + min(streak-1, 14) * 2` → ranges 10..38
- Streak resets if a day is missed
- One row per (user_id, claim_date) via UNIQUE constraint

Streak is computed by checking yesterday's row. Tracking goes through
the `User.karma` total — `arcade_daily_bonus.karma_granted` is the
audit trail.

## Open work

- **Replay validation**: capture client input_log + final state diff
  on top-50 monthly entries, run a server-side re-simulation worker
  to set `flagged_reason='replay_mismatch'` on cheaters. Requires
  Python port of each game's deterministic simulation.
- **Cron registration**: the monthly freeze is currently triggered
  manually via `POST /api/admin/arcade/finalise-month`. A proper
  systemd timer or background task should fire at 00:05 MSK on the
  1st of each month.
- **Spectator / ghost mode**: replay JSON already has milestones; a
  small UI could show "you vs leader" ghost path on the runner /
  digger games.
- **Daily challenge**: shared seed for the day across all players to
  produce a fair "daily" sub-leaderboard.
- **Achievements**: 10 / 100 / 1000 games played, "podium in 4/4 games
  same month", "perfect spotlight (no missed checkpoint)".
