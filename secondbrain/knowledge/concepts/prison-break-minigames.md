---
title: Prison Break — EPIC 5 mini-games (lock-pick, patrol planner, interrogation)
tags: [prison_break, lockpick, patrol, interrogation, mini-games, event-engine]
status: stable
updated: 2026-05-14
---

# Prison Break — mini-games layer (EPIC 5)

EPIC 5 added three player-facing mini-games that turn the previously
abstract `forged_key` / `patrol` / interrogation hooks into real, interactive
mechanics. New schema: 4 tables. New surface: 17 endpoints, 3 routes.

## Why three mini-games together

Each game pulls from a different EPIC's substrate and would have been
under-engineered if shipped solo:

- **Lock-pick** consumes `forged_key` (EPIC 3 craft), so the workshop loop
  becomes meaningful — crafting is no longer a status symbol.
- **Patrol planner** replaces the EPIC-2 random-roll `patrol` action with
  deterministic guard strategy. Pre-committed routes create negotiation
  surface ("I'll skip your block if you snitch on X").
- **Interrogation theatre** turns `snitch` into a two-sided drama. Until
  now snitching was a silent 50 🪙 transaction. Now suspects can push back,
  silence the inquisitor, or get framed.

All three resolve into the same `prison_break_action` audit table for
replay / analytics, and seed `prison_break_intel` atoms so EPIC 4's feed
stays alive on a guard-rich day.

## Schema (migration `20260514_1500`)

| Table | Purpose |
|-------|---------|
| `prison_break_lockpick_session` | one pin-tumbler attempt, server-hidden pin order |
| `prison_break_patrol_plan` | guard's saved route for one event day |
| `prison_break_interrogation` | multi-round Q&A session |
| `prison_break_interrogation_turn` | one transcript line per question/answer |

Key invariants enforced at the DB layer (partial unique indexes):

- One **active** lock-pick session per actor at a time.
- One patrol plan **per (guard, valid_for_day)** — re-saving the same day's
  plan updates in place; executing it is one-shot.
- One **active** interrogation between any (interrogator, suspect) pair.

## Lock-pick design

```
difficulty = 3 + clamp(cell.tunnel_progress // 25, 0, 4)   # max 7
forgive_misses = {master: 2, good: 1, crooked: 0}[key.quality]
crooked → difficulty += 1
```

`pin_sequence` is a server-side random permutation `range(difficulty)`.
Client gets `current_pin`, `misses`, `forgive_misses`, but **never** the
sequence. Each tap is `POST /lockpick/tap {pin_pick}`. Server checks
`pin_sequence[current_pin] == pin_pick`.

Win → actor moves to target cell (`PrisonBreakPlayer.cell_id` update),
+5 trust with new cellmates.
Loss → 50% caught (carcer = `cell.locked_until = now + 6h`); always
emits an event log.

## Patrol planner design

Route = ordered list of cell IDs (max 6) in the guard's block. Focus
modes:

| Focus | Detection bonus | AP cost | Side-effect |
|-------|-----------------|---------|-------------|
| balanced | +0% | 1 | — |
| aggressive | +15% | 2 | seeds public-warning intel for other guards |
| stealth | +5% | 1 | logs `stealth_pass` (visible only to the guard) |

Execution walks the route once. Per cell:

```
detection_chance = 0.20 + tunnel_progress * 0.30 + focus.detection_bonus
```

Already-discovered cells short-circuit to `empty`. Bust = sets
`tunnel_discovered=True`, lock cell for 2 days, public event log.

## Interrogation design

3 rounds. Two-tier tactics:

```python
INTERROGATOR_TACTICS = {ask: +2, bluff: +6, threat: +10, offer: +4}
SUSPECT_TACTICS = {truth: -10, lie: +4, silence: -3}
```

Pressure resolves at:
- ≥80 → **confession**: side-effects depend on topic
  - `tunnel` → discover suspect's cell tunnel
  - `alliance` → leak every pact suspect is in (intel atoms to interrogator)
  - `role` → reveal suspect's role to interrogator
  - `intel_leak` → emit a true rumor pointing at suspect
- ≤20 → **silence**: -8 trust, seeded rumor "X крепкий — допросом не сломать"
  delivered to up to 8 prisoners

If neither threshold is hit by round 3:
- pressure ≥60 → confession
- pressure ≤40 → silence
- 40 < pressure < 60 → `aborted` with `reason: timeout_inconclusive`

Eligibility: only `guard | authority | boss` can start. AP costs are paid
**only by the interrogator** (start = 2 AP, each question = 1 AP). Suspect's
turn is free — they're the defender.

## Frontend pages

- `/event/prison-break/lockpick` — pin grid with motion springs. Server
  returns only `current_pin / misses`, so the UI animates pins lifting
  on correct taps and shaking on wrong taps.
- `/event/prison-break/patrol` — two-column builder: block cells on the
  left (click to append), ordered route on the right (↑/↓/× per item),
  focus chips at top, execute-button shows AP cost from the focus mode.
- `/event/prison-break/interrogation` — Slack-style theatre: session list
  on the left, transcript + pressure gauge + tactic chips on the right.
  Tactic buttons show the pressure delta inline so newcomers can learn
  the system in one game.

## Cells endpoint addition

The lock-pick UI needs to list cells across blocks (including blocks the
actor isn't in). Added `GET /api/event/prison-break/cells` returning a
lightweight summary — every registered player can call it. Sensitive
fields (member roster, chat) still live behind `/cells/{id}` with the
cellmate ACL.

## Why all three resolve through `prison_break_action`

Reduces follow-up work. The trust history viewer in EPIC 4 already pulls
from this table; adding `lockpick_won / lockpick_lost / patrol_execute /
interrogation_confession / interrogation_silence` rows automatically
surfaces these in the player's trust + history feeds without any extra
plumbing.

## Open work flowing into EPIC 6+

- Lock-pick UI shows pin numbers in plain order (1..N) — the player has no
  hint other than memory and luck. A "feedback" pulse on correctness was
  considered too easy; current model keeps the difficulty meaningful.
  EPIC 6 could add a "listening" item (radio variant) that shows the
  next-correct pin in exchange for AP.
- Patrol plans are per-day but the day-boundary cron is informal — when
  the next `daily_tick` runs, today's plans should auto-archive
  (yesterday's plan flag → readonly). For now we only check `executed`.
- Interrogation `lie` tactic deliberately doesn't lower pressure to make
  bluffs valuable, but it doesn't yet plant fabricated intel either. A
  third-round-only "frame" outcome was scoped out — punt to EPIC 6.
