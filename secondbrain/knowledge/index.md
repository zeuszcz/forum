# Knowledge Base Index

| Article | Summary | Tags | Updated |
|---------|---------|------|---------|
| [headless-spec-anti-flood](concepts/headless-spec-anti-flood.md) | Why the headless xash3d spec needs cl_cmdrate / cl_updaterate caps to survive the jail server's ProcessCmds anti-speedhack | cs1.6, xash3d, processcmds, anti-cheat | 2026-05-12 |
| [headless-spectator-target-control](concepts/headless-spectator-target-control.md) | Why click-to-follow on the VPS spec must set pev_iuser1/iuser2 via fakemeta, not engclient_cmd spec_player | cs1.6, amxx, fakemeta, spectator | 2026-05-11 |
| [prison-break-social-layer](concepts/prison-break-social-layer.md) | EPIC 4 architecture: why intel + trust + alliance ship as one cohesive layer with shared daily-tick wiring, truth-reveal gate, and pairwise-trust normalisation | prison_break, intel, trust, alliance, event-engine | 2026-05-14 |
| [prison-break-minigames](concepts/prison-break-minigames.md) | EPIC 5 architecture: lock-pick pin-tumbler, patrol grid planner, interrogation theatre — schema, pressure-driven resolution, per-game design invariants | prison_break, lockpick, patrol, interrogation, mini-games | 2026-05-14 |
| [prison-break-arena](concepts/prison-break-arena.md) | EPIC 6 architecture: server-authoritative 1×1 fighter, 12 specials, 15Hz tick engine, per-match WS state stream, Canvas2D renderer, bet payout settlement | prison_break, arena, netcode, websocket, canvas | 2026-05-14 |
| [prison-break-finale](concepts/prison-break-finale.md) | EPIC 7 architecture: 7 reveal cinematics, Final Night isometric Canvas, voting + outcome resolution, auto-fired-on-daily-tick scheduler, side-payouts | prison_break, reveals, finale, voting, broadcast | 2026-05-14 |

## How to read this

`knowledge/concepts/` — atomic articles about durable decisions, regressions, invariants.
`knowledge/connections/` — synthesis across 3+ concepts.
`knowledge/qa/` — filed query answers worth keeping.
`daily/` — append-only raw session logs.

A concept lands here only when there is **durable, non-obvious** knowledge to capture:
a non-trivial decision, a root-cause fix worth genealogy, an invariant, a regression
worth remembering. Trivial fixes don’t belong here — the commit message + diff are enough.
