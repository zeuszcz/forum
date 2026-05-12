# Knowledge Base Index

| Article | Summary | Tags | Updated |
|---------|---------|------|---------|
| [headless-spec-anti-flood](concepts/headless-spec-anti-flood.md) | Why the headless xash3d spec needs cl_cmdrate / cl_updaterate caps to survive the jail server's ProcessCmds anti-speedhack | cs1.6, xash3d, processcmds, anti-cheat | 2026-05-12 |
| [headless-spectator-target-control](concepts/headless-spectator-target-control.md) | Why click-to-follow on the VPS spec must set pev_iuser1/iuser2 via fakemeta, not engclient_cmd spec_player | cs1.6, amxx, fakemeta, spectator | 2026-05-11 |

## How to read this

`knowledge/concepts/` — atomic articles about durable decisions, regressions, invariants.
`knowledge/connections/` — synthesis across 3+ concepts.
`knowledge/qa/` — filed query answers worth keeping.
`daily/` — append-only raw session logs.

A concept lands here only when there is **durable, non-obvious** knowledge to capture:
a non-trivial decision, a root-cause fix worth genealogy, an invariant, a regression
worth remembering. Trivial fixes don’t belong here — the commit message + diff are enough.
