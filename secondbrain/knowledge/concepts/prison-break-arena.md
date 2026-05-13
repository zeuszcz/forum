---
title: Prison Break — EPIC 6 arena 2D fighter + server-authoritative netcode
tags: [prison_break, arena, netcode, websocket, canvas, mini-games, event-engine]
status: stable
updated: 2026-05-14
---

# Prison Break — arena (EPIC 6)

Server-authoritative real-time 1×1 fighter. 12 specials, 15Hz tick,
Canvas2D render on the client, WebSocket state stream out, HTTP input
intents in.

## Architecture

```
       HTTP                    WS push                 HTTP polling
client ─POST input─▶ engine ───state snap───▶ client    ──GET state── (fallback)
       intent       (process-local         render
                     in-memory)
```

Components:

| File | Role |
|------|------|
| `services/prison_break/arena_engine.py` | tick loop, physics, 12 specials catalog, fighter state, subscribers |
| `services/prison_break/arena_service.py` | lifecycle (challenge/accept/forfeit), loadout, bets |
| `routers/prison_break/arena.py` | 14 HTTP endpoints + 1 WS endpoint |
| `frontend/src/app/event/prison-break/arena/page.tsx` | lobby — active matches + history |
| `.../arena/loadout/page.tsx` | pick exactly 3 specials |
| `.../arena/[matchId]/page.tsx` | Canvas2D render + keyboard/buttons input |

## Engine model

```
Tick rate         15Hz  (TICK_DT = 1/15 s)
Stage             800 × 240 px
Fighter           40 × 80 px
HP / Stamina      100 / 100, stamina regens 12/sec while idle
Match duration    90 s (1350 ticks max)
Win conditions    1) HP ≤ 0
                  2) Timeout — higher HP wins; tie → more landed_hits; tie → coin flip
```

Each fighter has:

```
x, vx          position + velocity in px / px·s⁻¹
facing         +1 right, -1 left  (auto-faces opponent when idle)
hp, stamina
action         idle | moving | startup | active | recovery |
               stunned | blocking | parry_window
action_slug    current special slug (only when in startup/active/recovery)
frame_left     ticks until the next phase
cooldowns      {slug: ticks_remaining}
move_intent    -1 / 0 / +1
block_intent   "low" | "mid" | "high" | None
queued_special slug or None
```

## 12 specials

| slug | name | dmg | stam | range | height | startup | active | recovery | cd |
|------|------|-----|------|-------|--------|---------|--------|----------|----|
| punch_jab | Прямой удар | 8 | 10 | 44 | mid | 2 | 2 | 3 | 4 |
| punch_hook | Хук | 12 | 15 | 52 | mid | 4 | 3 | 5 | 8 |
| kick_round | Удар ногой | 16 | 20 | 60 | mid | 5 | 3 | 6 | 10 |
| throw_grab | Бросок (ignores parry/block) | 14 | 22 | 38 | mid | 3 | 2 | 8 | 18 |
| shiv_strike | Заточка | 22 | 18 | 40 | mid | 4 | 2 | 10 | 20 |
| bat_swing | Биткой | 18 | 22 | 70 | high | 6 | 4 | 8 | 15 |
| charge_run | С разбега (dash) | 20 | 25 | 46 | mid | 8 | 3 | 6 | 22 |
| sweep_low | Подсечка | 10 | 18 | 58 | low | 4 | 2 | 7 | 14 |
| parry | Перехват | — | 12 | — | mid | 1 | 4 | 6 | 12 |
| wild_haymaker | Дикий замах | 42 | 35 | 56 | high | 14 | 2 | 18 | 40 |
| psycho_dash | Псих-рывок (dash) | 6 | 14 | 38 | mid | 2 | 2 | 4 | 10 |
| feint | Финт (clears all cooldowns) | 0 | 6 | — | — | 2 | 1 | 2 | 6 |

Height encodes the hit-vs-block matchup: if defender is blocking the
same height, attack absorbed. `throw_grab` ignores blocks and parries.
`parry` opens a 4-tick parry_window — incoming attack returns small
self-damage to the attacker + doubles their recovery. `feint` is
specifically the cooldown-reset move; landing one wipes your own
cooldowns so you can chain the same special again.

## Hit resolution timing

When an action transitions startup → active, the very same tick the
engine resolves the hitbox. Hitbox is anchored at
`attacker.x + facing * FIGHTER_W/2` and extends `range` along facing.
If defender's box overlaps and defender is **not** in
matching-height block / parry_window, the hit lands. This is single-tick
detection — no rollback / no client prediction. The 15Hz tick is fast
enough for responsive combat at ~67ms per tick.

Knockback applies a one-shot velocity impulse; we damp 15% per tick
during recovery/stunned, so knockback fades naturally without an
extra friction system.

## Netcode model

**Server-authoritative.** Clients send discrete "input intents" via HTTP
POST (`type: move|block|special`). The continuous movement comes from
a poll-style intent: client sends `dx=±1` every 150 ms while a key
is held; server treats it as the current move state.

**State out**: WebSocket `/arena/{id}/ws`. Each subscriber gets a
private `asyncio.Queue` from the engine. On each broadcast-due tick
(every 2 ticks ≈ 7.5 Hz) the engine drops a `snapshot` dict into every
queue. WS handler `await q.get()` → `ws.send_text(json.dumps(msg))`.

The dedicated per-match WS path is deliberate — re-using the existing
`PrisonBreakBroadcaster` would deliver arena ticks to every player WS
in the event, including those who don't care. The match-scoped WS
keeps fan-out cost ∝ spectators, not ∝ all event players.

## DB persistence

Existing table `prison_break_arena_match` (from migration `20260513_1500`)
already covers the lifecycle. EPIC 6 added a single column via
`20260514_1800_prison_break_arena_loadout.py`:

```sql
ALTER TABLE prison_break_player
ADD COLUMN arena_loadout JSON NOT NULL DEFAULT '{}'::json;
```

`arena_loadout` shape:
```json
{
  "specials": ["punch_jab", "kick_round", "shiv_strike"],
  "wins": 0,
  "losses": 0,
  "updated_at": "..."
}
```

The `replay` JSON on `arena_match` stores:
- `meta`: `{challenger_id, loadout_a, loadout_b, challenged_at, accepted_at}`
- `frames`: last 200 ticks for replay scrubber (capped — full replay
  would be ~1350 frames per 90s match)
- `events`: every `ArenaEvent` for analytics (hits, parries, KOs)

## Lifecycle watchdog

When a match transitions to `active`, the router spawns
`_watch_for_finish(match_id)` as an `asyncio.create_task`. It polls
`arena_engine.get(match_id).finished` every 0.5s and once true, opens
a new DB session and calls `arena_service.finalize_match()` which:
1. Sets `status='finished'`, `winner_id`, `ended_at`.
2. Persists frames + events into the `replay` JSON.
3. Bumps wins/losses on both players' `arena_loadout`.
4. Settles all unsettled bets (1.95× payout to correct bettors,
   refund on no-winner edge).
5. Logs `arena_finish` action.
6. `arena_engine.unregister(match_id)`.

Failsafe: the watchdog times out at ~400s. If the engine wedged, the
match row stays in `active` and admin can `/forfeit` manually.

## Frontend canvas

Single 800×240 `<canvas>` element with `imageRendering: pixelated`.
Per state snapshot:

1. Floor gradient + faint red grid lines.
2. Each fighter drawn as a 40×80 rect with:
   - Body in side color (cyan = a, rose = b).
   - Boots band (darker color) at bottom 14 px.
   - Head (18 px tall, 24 wide).
   - 4×4 px "eye" pixel offset by facing direction.
3. Action indicators:
   - `startup` → amber border around body.
   - `active` → red translucent hitbox rect in front (preview of
     where the hit will land).
   - `blocking` → cyan border.
   - `parry_window` → purple thick border.
   - `stunned` → ✦ char above head.
4. Hit flash → red overlay over the loser for one frame.

Render rate matches WS push rate (~7.5 Hz). The browser interpolates
nothing — we want WYSIWYG with the authoritative state.

## Bet model

Spectators (anyone not in the match) can place a bet on either side
while `status == active`. Fixed odds 1.95×. Bet creation:
- Deducts amount from `player.money` immediately.
- Adds row in `prison_break_arena_bet` with `odds=Decimal("1.95")`.
- On match settle: winner-side bets → payout = amount × 1.95;
  loser-side bets → payout = 0; no-winner → refund.

Anti-self-bet: bettor must not be a participant. Anti-pad: bet must
be ≥ 1 and ≤ 10000.

## Wiring

```
backend/app/main.py             include_router(prison_break.arena_router)
routers/prison_break/__init__   re-export arena_router
services/prison_break/__init__  re-export arena_engine + arena_service
schemas/prison_break/__init__   11 new arena schemas
```

Dashboard quick-link row now spans 5 tiles total: cell / workshop /
market (row 1), intel / trust / alliances (row 2), lockpick / patrol /
interrogation (row 3), arena (row 4 — full-width since it's the
flagship). Sidebar "Мини-игры" block has all 6 entries marked `live`.

## Open work flowing into EPIC 7

- **Replay scrubber** — `frames` are persisted but no UI yet. EPIC 7
  Final-Night cinematic can reuse them ("here's the highlight reel").
- **Spectator count** — engine doesn't currently expose subscriber
  count. Cheap to add: `len(match.subscribers)` field on snapshot.
- **Reconnect ramp** — if a participant's WS drops, they keep their
  current `move_intent` (last known). A "rejoin" handler could replay
  the last 30 frames so they catch up visually.
- **Anti-stale-loadout** — opponent's loadout is read at `accept` time.
  If we want to support "loadout locked at challenge time" instead,
  store both at `challenge` and reject loadout edits while pending.
