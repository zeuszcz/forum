# SecondBrain Activity Log

Append-only build / compile / query / lint events. `merge=union` in `.gitattributes`
keeps merges painless across branches.

## [2026-05-14] ingest | Prison Break EPIC 4 — intel + trust + alliance landed

- Shipped the social layer of the 21-day event as one cohesive batch
  (3 services + 1 HTTP router + 3 schemas + 3 frontend pages + dashboard
  teasers). Reasoning + invariants captured in
  `concepts/prison-break-social-layer.md`.
- `daily_tick` now also calls `intel_service.daily_distribute` and
  `alliance_service.expire_due` so all three concerns advance on the same
  cron tick. Wrapped in try/except — AP refill is the load-bearing path.
- `intel_service` has 30 hand-written templates, 5 categories, per-role
  daily budgets (2-3 atoms), and a 12% planted-fabrication budget for
  spies/bosses. The reveal_truth gate is staff-only; ordinary players
  will see truth only at the EPIC-7 Final Night cinematic.
- `trust_service.adjust` is the new canonical mutator (clamps 0..100,
  normalises pair order). All callers that previously hand-coded the
  `sorted([a,b])` dance can migrate as we touch them.
- `alliance_service` stores signatures inside `terms.signatures` instead
  of a side table — cheaper read, single-row write per sign, easy
  Pydantic surface. Break penalty: -15 trust with every other party.

## [2026-05-11] bootstrap | SecondBrain wired into forum repo

- Scaffolded `secondbrain/{scripts,hooks,templates,daily,raw,knowledge}` from the
  CorporateMessanger reference.
- `knowledge/project-context.md` written from scratch — stack, repo layout,
  domains, invariants, deploy procedure.
- `.claude/settings.json` registers SessionStart / SessionEnd / PreCompact /
  PostToolUse / Stop hooks so each new Claude Code session gets the context
  injected and any durable knowledge flows back into `daily/`.

## [2026-05-12] ingest | ephemeral system broadcast for high-frequency feeds

- Added `ephemeral=true` flag on `POST /shoutbox/system` so `cs-log-listener`
  can stream every in-game `say` line without inserting one Postgres row per
  message. Event type `ephemeral_system` is filtered on the consumer side
  (`/admin/cs-chat` Live-toggle) by `category`.
- Public `Shoutbox.tsx` is unaffected — its WS `switch` has no default arm
  so unknown event types silently drop.
- Invariant captured in `project-context.md` under Critical invariants.

## [2026-05-11] ingest | headless spec target control via pev fields, not spec_player

- Click-to-follow toast was lying — backend RCON returned OK, AMX plugin logged
  "locked onto userid=N", but cs16-client never moved the camera. Root cause:
  cs16-client does not register the `spec_player` console command. Only
  `spec_mode`, `spec_autodirector`, `_spec_find_next_player` exist on it.
- Fix in `jbf_forum_spectator.sma` v0.6 (commit `8997665`): set
  `pev_iuser1 = 4` (OBS_CHASE) and `pev_iuser2 = target_id` via fakemeta
  `set_pev`. The engine reads these fields each think tick; the camera
  follows without any client console dependency. `spec_autodirector 0`
  still goes through `engclient_cmd` so the autopilot does not steal focus.
- Captured as `concepts/headless-spectator-target-control.md`. First
  real concept landing post-bootstrap; index updated.
- Live verify deferred — player left T/CT before retest. Manual check when
  next player joins.

## [2026-05-12] ingest | ProcessCmds anti-speedhack kicked the headless spec

- Symptom: forum_spectator vanished from `rcon status` while xash3d
  process stayed alive on VPS (systemd never failed). User saw a
  frozen frame on /live with "Server issued disconnect, Reason:
  Banned for move commands flooding (burst)" in the dev console.
- Root cause: ProcessCmds v1.2.0.6 (meta-mod) caps the rate of
  usercmd packets per client. Headless xash3d at fps_max 30 still
  emitted bursty cmd packets when chase-cam was active (engine ticks
  decoupled from render fps). After enough rounds, ProcessCmds
  caught a burst and kicked.
- Fix: userconfig.cfg v3 (commit `02861c5`) — explicit
  `cl_cmdrate 15`, `cl_updaterate 15`, `rate 7500`, plus `sensitivity 0`
  on the mouse axes. Three-minute persistence poll confirmed the
  throttle holds — same userid / socket across 3 successive `status`
  reads.
- Auto-recovery from a future kick still needs Phase S6 (external
  rcon-polling watchdog that bounces cs-spectator.service when the
  spec falls off).
- Captured as `concepts/headless-spec-anti-flood.md`; cross-linked
  with the v0.6 plugin concept since the two regressions touch the
  same domain.
