---
title: Prison Break — EPIC 4 social layer (intel + trust + alliance)
tags: [prison_break, intel, trust, alliance, event-engine, architecture]
status: stable
updated: 2026-05-14
---

# Prison Break — social layer (EPIC 4)

EPIC 4 added the **information + relationship** layer of the 21-day prison-break
event. It sits between the action engine (EPIC 2) and the mini-games (EPIC 5+).
Three coupled services, one HTTP module, three frontend pages, one schema bump.

## Why three concerns live together

Intel, trust, and alliances are deliberately one EPIC because they form a
tight loop:

1. The intel generator drops rumors / leaks / secrets into a player's feed
   each day (`intel_service.daily_distribute`).
2. Forwarding intel costs 1 AP and bumps pairwise trust +2
   (`intel_service.forward_to` → `trust_service.adjust`).
3. Trust gates social weight — high pairs are natural alliance candidates.
4. Breaking an alliance burns -15 trust with every other party
   (`alliance_service.break_pact` → `trust_service.adjust`).
5. Snitches and broken pacts feed intel templates that hint at the same
   players, closing the loop.

Splitting these into three EPICs would have produced three stub services
that each call into the others — easier to land as a single cohesive batch.

## Services

| File | Role |
|------|------|
| `app/services/prison_break/intel_service.py` | 30 templates · daily generator · forward-to |
| `app/services/prison_break/trust_service.py` | adjust · list_for_player · voluntary gift/vouch/slap · history |
| `app/services/prison_break/alliance_service.py` | propose · sign · cancel · break · expire_due |

All three are **transaction-aware but commit-agnostic** — they `db.add` and
`db.flush`, the router commits. Same pattern as `action_service` to keep
the dispatcher / handler split clean.

## Daily tick wiring

`action_service.daily_tick` was extended to call `intel_service.daily_distribute`
and `alliance_service.expire_due` after AP refill. Wrapped in `try/except`
so an intel hiccup never blocks AP refresh — the AP refill is the
load-bearing invariant.

```python
try:
    from app.services.prison_break import alliance_service, intel_service
    await intel_service.daily_distribute(db, event)
    await alliance_service.expire_due(db, event.id)
except Exception:
    pass
```

## Intel template anatomy

Templates are dataclasses (`IntelTemplate`) with five fields:
`slug`, `category` ∈ {rumor, warning, secret, leak, tip}, `text` with
`{nick}/{block}/{cell}/{role}/{faction}` placeholders, `audience` (which
roles ever receive it), and `truth_bias` (probability the rendered atom is
true).

Per-role daily budgets (in `daily_distribute`):
- prisoner: 2 atoms, categories {rumor, tip}
- guard:    2 atoms, categories {warning, leak}
- authority: 2 atoms, categories {secret, rumor}
- spy:      3 atoms, categories {leak, secret, rumor}
- boss:     3 atoms, categories {secret, leak, warning}

12% of `leak`/`secret` atoms are flagged `fabricated=True` with a planted
`source_role` from the spy/boss pool — a deliberate misinformation budget
so the late-game reveal phase has something to expose.

## Alliance lifecycle

```
proposed ──(all parties sign)─→ active ──(expires_at hit)─→ expired
   │                              │
   ├──(any party cancels)─→ cancelled
   │
   └─(active: any party breaks)─→ broken  (-15 trust to every other party)
```

Signatures are stored inside `alliance.terms.signatures` (an integer list)
rather than as a side table. Cheaper to read, single-row write per sign,
and Pydantic surfaces `is_signed_by_me` on the way out.

`expires_at` defaults to `now() + 5 days`. The daily tick promotes any
overdue `active` pact to `expired` — no separate cron needed.

## Truth-reveal gate

`GET /intel?reveal_truth=true` is staff-only. The `is_truth` /
`fabricated` / `source_role` fields are `None` for ordinary players
until the post-finale reveal cinematic (EPIC 7) lifts the veil. The
router silently downgrades non-staff requests instead of 403'ing —
prevents UI breakage on benign queries.

## WebSocket signals added

| Kind | Visibility | Payload |
|------|-----------|---------|
| `intel_forwarded` | private | `intel_id`, `from_id`, `to_id` |
| `alliance_proposed` | private (per party) | `alliance_id`, `proposer_id` |
| `alliance_activated` | private (per party) | `alliance_id` |
| `alliance_broken` | private (per party) | `alliance_id`, `broken_by_id`, `trust_delta` |

The existing `_Broadcaster.broadcast` already supports `visibility="private"`
with `target_id`, so no broadcaster changes were needed — only fire-and-forget
`asyncio.create_task` calls in the router.

## Frontend routes

- `/event/prison-break/intel` — feed + 1-AP forward modal
- `/event/prison-break/trust` — matrix, 3 voluntary actions, history feed
- `/event/prison-break/alliances` — propose modal + sign/cancel/break

Dashboard sidebar got an `IntelTeaser` (last 3 atoms) and `AlliancesTeaser`
(top 4 alliances) replacing the EPIC-4-todo stub. Both teasers lazy-fetch
on mount; failure silently shows the empty state — no toasts on the
dashboard route since they would fire on every navigation.

## Why the trust table has `user_a < user_b` constraint

Stored once per ordered pair. Every read normalises with
`a, b = sorted([x, y])` before SELECT. Removes a class of duplicate-row
bugs the previous EPIC-2 visit/snitch handlers were already protecting
against, now formalised. New `trust_service.adjust` always normalises so
the rest of the codebase can pass raw IDs.

## Open work flowing into EPIC 5+

- `intel_service` has no spy/boss explicit "plant intel" action yet — only
  the 12% auto-fabrication. EPIC 5 may add a `prison_break_action` type
  `plant_intel` with an AP cost.
- Alliance pact effects (mutual_dig bonus, intel_share auto-forward,
  loan due-date enforcement) are still **informational** — the engine
  doesn't enforce them yet. Each one is a small EPIC-5/6 follow-up.
- The Final Night reveal (EPIC 7) will set `reveal_truth=True` for all
  players, which is why the gate exists today.
