# AGENTS.md — endless-war SecondBrain Schema

> Inspired by Andrej Karpathy's LLM Knowledge Base pattern + the
> claude-memory-compiler reference. Knowledge is compiled from Claude Code /
> Cursor sessions and durable artefacts, never re-derived on every query.

## Storage

`secondbrain/` lives inside the forum repo so `git clone` gives you a working wiki.

**Git-versioned:**
- `knowledge/` — compiled wiki (`index.md`, `log.md`, `concepts/`, `connections/`, `qa/`)
- `daily/YYYY-MM-DD.md` — append-only raw logs (`merge=union`)
- `raw/` — immutable snapshots of external sources
- `scripts/`, `hooks/`, `templates/`
- `AGENTS.md`, `README.md`

**Git-ignored** (local state — `.gitignore`):
- `scripts/state.json`, `scripts/last-flush.json`, `scripts/docs-state.json`,
  `scripts/memory-state.json`, `scripts/maintenance-state.json`,
  `scripts/last-memory-sync.json`
- `scripts/*.log`, `scripts/tmp/`, `reports/`

## Layers

| Layer  | Path           | Owner | Notes                                              |
|--------|----------------|-------|----------------------------------------------------|
| Raw    | `daily/`       | hooks | Append-only conversation transcripts + diffs       |
| Wiki   | `knowledge/`   | LLM   | Compiled artefacts (concepts/connections/qa/index) |
| Schema | `AGENTS.md`    | human | This file — the contract                           |

## Compile flow

```
SessionEnd / Stop hook → flush.py → daily/YYYY-MM-DD.md
                                  ↓
                          compile.py (manual or daily cron)
                                  ↓
                          knowledge/concepts/*.md + index.md update
```

Hooks live in `secondbrain/hooks/` and are wired via the repo `.claude/settings.json`.

## When to write a concept

A concept lands in `knowledge/concepts/` only when there is **durable, non-obvious**
knowledge worth carrying across sessions:

- Root-cause genealogy for a regression you fixed
- Non-trivial architectural decision (and the "why")
- Invariants the codebase silently relies on
- Reusable lesson that future-you might unknowingly violate

A typo fix, a CSS tweak, a small rename → no concept. A commit + log line is enough.

## Triggers that REQUIRE a concept/log update

Same as the CorporateMessanger contract — anything matching:

- Architecture / re-architecture / new component boundary
- Security model change (auth, RBAC, CSP, rate-limit)
- Caching / invalidation strategy change
- Protocol / data-contract / pattern change (WS events, API schemas, envelope shape)
- Root-cause regression fix with a reusable lesson
- New operational rule / invariant

## Anti-noise discipline

- Ceiling **45 concepts**. At ceiling, update an existing concept, do not create a new one.
- 3+ related concepts → write a `connection`, not a fourth concept.
- One concept per regression genealogy, not one per attempt in the chain.

## Memory bridge

When the user edits Claude Code auto-memory (`~/.claude/projects/<hash>/memory/*.md`),
`scripts/sync_memory.py` ingests diffs into the daily log (once per UTC day, on
SessionStart). The wiki therefore reflects both: durable session knowledge
**and** user-defined preferences/feedback/project state.

## Slash commands (defined in `.claude/commands/`)

| Command            | Purpose                                          |
|--------------------|--------------------------------------------------|
| `/sb-query <q>`    | Ask the wiki — index-guided retrieval, no RAG    |
| `/sb-compile`      | Compile changed daily logs into concepts         |
| `/sb-lint`         | 7 health checks (broken links, orphans, stale, …)|
| `/sb-status`       | Wiki size / last compile / untracked logs        |
| `/sb-ingest-docs`  | Pull `docs/**` + `CLAUDE.md` into today's log     |
| `/sb-ingest-memory`| Pull Claude Code auto-memory diffs into today    |
| `/sb-check-staleness` | Find stale concepts vs current repo HEAD      |
