# SecondBrain Activity Log

Append-only build / compile / query / lint events. `merge=union` in `.gitattributes`
keeps merges painless across branches.

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
