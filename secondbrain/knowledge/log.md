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
