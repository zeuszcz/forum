---
title: Prison Break — EPIC 7 reveal cinematics + Final Night isometric broadcast
tags: [prison_break, reveals, finale, voting, isometric, broadcast, event-engine]
status: stable
updated: 2026-05-14
---

# Prison Break — finale layer (EPIC 7)

Closes the 21-day arc. Three pieces:

1. **Reveals** — 7 scheduled cinematics throughout the event that peel
   back layers of hidden state (roles, alliances, tunnel progress,
   intel truth, faction counts, the boss, and the full final curtain).
2. **Final Night isometric** — live Canvas2D top-down view of the
   whole prison, polled at 1 Hz, showing every cell, member states,
   active arena matches, and alliance count.
3. **Voting + outcome** — players vote on `boss / snitch / hero`; the
   service tallies, applies majority rule for boss-identification, and
   resolves the winning side with auto-payouts.

## DB

Migration `20260514_2100_prison_break_finale.py` adds:
- `prison_break_final_vote` table with a `(event_id, voter_id, kind)`
  unique constraint so a player has at most one vote per category.
- `prison_break_player.revealed_role` nullable string column. Set by
  reveal_service when a role-exposing reveal fires.

The existing `prison_break_reveal` table (from EPIC 1 migration) carries
each reveal as a row with `scheduled_for`, `revealed_at`, JSON `payload`.

## 7 reveal types

| slug | what it exposes | day (default) |
|------|-----------------|---------------|
| `tunnel_status` | every cell's tunnel progress + discovered flag | 5 |
| `alliance_dump` | every active alliance with parties + expires_at | 9 |
| `faction_count` | living-count per faction (prisoner/guard) | 11 |
| `role_reveal` | one random un-revealed non-prisoner role-holder | 13 |
| `role_reveal` | another non-prisoner role-holder | 17 |
| `intel_truth` | truth + fabrication flag for every intel atom | 19 |
| `boss_reveal` | exposes the boss explicitly | 20 |
| `final_curtain` | full state dump: every role + cell + side payouts | 21 |

Default schedule is created idempotently when `ensure_default_schedule`
fires. Daily tick (`action_service.daily_tick`) now calls
`reveal_service.auto_fire_due` so any past-due reveal triggers
automatically — no separate cron needed.

`trigger_reveal_now` lets staff fire any reveal early via
`POST /admin/reveals/fire {reveal_type, day?}`.

## Reveal handlers — side effects

| handler | side-effect (besides the payload) |
|---------|------------------------------------|
| `_h_role_reveal` | sets `player.revealed_role = player.role` so `/players` exposes it |
| `_h_boss_reveal` | same as above, scoped to the boss |
| `_h_alliance_dump` | none, payload-only |
| `_h_tunnel_status` | none, payload-only |
| `_h_intel_truth` | none, payload only (with last-40 atoms cap) |
| `_h_faction_count` | none, payload-only |
| `_h_final_curtain` | sets `revealed_role` on **every** player |

Every handler also writes a public `PrisonBreakEventLog` row of kind
`reveal_<slug>` so WS subscribers see the cinematic fire in real time.

## Voting model

3 categories × 1 vote per player = up to 3 votes per player.
Anti-self-vote enforced. Re-casting just updates the existing row
(no spam writes).

Boss-identification: counted as "correctly identified" only when more
than half of all boss-kind voters voted for the actual boss. Just a
plurality is **not** enough — the prison has to be sure.

## Outcome resolution

```
escape_count   = prisoners/authorities in cells with tunnel_progress >= 100
                 and not discovered and unlocked
escape_rate    = escape_count / count(prisoners + authorities)

winning_side =
  - prisoners   if escape_rate ≥ 0.5 and boss not correctly identified
  - guards      if boss correctly identified and boss didn't escape
  - boss        if boss escaped and not correctly identified
  - prisoners   if escape_rate ≥ 0.3 (fallback)
  - guards      otherwise
```

Spies have a **parallel** win condition: any spy who escaped wins
individually regardless of the team outcome.

Payouts (credited to `player.money` by `apply_payouts`, idempotent via
`event.config.final_payouts_applied`):
- +200 🪙 to every winning-side player
- +500 🪙 to the boss if `winning_side == "boss"`
- +300 🪙 to every escaped spy
- +50 🪙 to the most-voted hero

## Isometric Canvas2D renderer

Logical canvas 720 × 360 px. Three horizontal rows (blocks A/B/C),
each row a flex of cells. Per cell:
- Slab background — dim red if `tunnel_discovered`, dim slate
  otherwise.
- Tunnel progress bar 4 px tall at the bottom, colored by progress
  thresholds (green ≥100 / amber ≥75 / cyan ≥30 / grey otherwise).
- Cell label `A-1` top-left.
- Up to 6 member dots — color-coded by status + revealed role
  (orange = boss revealed, amber = guard revealed, purple = spy,
  green = fled, red = caught).
- ✕ marker top-right if discovered.

Polled at 1 Hz from `/api/event/prison-break/finale/snapshot`. The
frontend re-renders the canvas on each snapshot — no client-side
interpolation since updates are slow.

Footer text: `Day N · фаза X · альянсов Y · арена Z`.

## Wiring + dashboard

Backend `main.py` includes `prison_break.finale_router`. The /players
endpoint (in `router.py`) was updated to surface `revealed_role` from
the player row — previously hardcoded to `None`. So every reveal that
sets the flag automatically becomes visible in the player list across
the whole UI.

Daily tick chain extended:
```
action_service.daily_tick:
  refill AP →
  intel_service.daily_distribute →
  alliance_service.expire_due →
  reveal_service.auto_fire_due   ← EPIC 7
```

Dashboard now has two new tiles in a sidebar row: **Хроника**
(/reveals) and **Финал** (/finale). The latter is flame-glowing to
signal "this is the end".

## Open work / future improvements

- Reveal payload sizes are uncapped except for `intel_truth` (40-atom
  tail). For events with very long intel histories the
  `intel_truth.atoms` list could be paginated; alternatively the
  truth-flag is set on the atom row itself (cheaper but loses the
  bulk-reveal moment).
- The isometric view polls at 1 Hz. Switching to a WS push from
  `_h_*` reveal handlers + arena finishes could remove the poll loop
  entirely, but at the cost of a per-event subscriber multiplier on
  the existing broadcaster.
- The `_resolve_player` in finale_router does NOT require event.status
  == "active" — voting + snapshot still work on finished events so
  the cinematic stays viewable after the season ends. The earlier
  routers gate on active; here that's deliberate.
- The voting threshold (>1/2) is hard-coded. A future tuning knob in
  `event.config.finale_threshold` could let staff balance the
  boss-identification difficulty across seasons.
