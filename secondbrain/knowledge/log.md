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
