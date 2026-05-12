---
name: Headless spectator target control via engine pev fields
description: Why click-to-follow must set pev_iuser1/iuser2 directly, not engclient_cmd("spec_player") — cs16-client does not register that command
type: regression
tags: [cs1.6, amxx, fakemeta, spectator, cs16-client, xash3d]
updated: 2026-05-11
---

# Headless spectator target control via engine pev fields

## Context

The headless spectator stack on the VPS is **xash3d-fwgs + cs16-client** (open-source
GoldSrc engine + open-source `client.so`). It is **not** the Steam CS 1.6 client. The
two are mostly drop-in compatible at the network protocol level, but the set of
console commands the client registers is a strict subset of the Steam client.

## The regression (v0.5 → v0.6 of `jbf_forum_spectator.sma`)

`/admin/live` exposes a "Spec в игре" button per player. Clicking it should move the
headless spectator camera onto that player. Wire flow:

```
button → POST /live/spec/follow {target_userid}
       → backend cs_rcon.execute("forum_spec_follow <userid>")
       → AMX plugin handles concmd
       → relays target switch to spectator client
```

v0.5 relayed the target via:

```pawn
engclient_cmd(spec_id, "spec_player", "#<userid>");
```

This is the canonical Steam-client incantation. On cs16-client it is **silently
dropped** — the command is not registered. The backend RCON call succeeded, the
plugin logged `locked onto userid=…`, and the toast showed `Spec → userid #N (806ms)`
on the frontend. But the camera never moved.

## Root cause

cs16-client only registers these spectator console commands:

- `spec_mode <n>` — set view mode (1=in-eye, 2=chase, 4=director-chase, 3=free-roam)
- `spec_autodirector <0|1>` — toggle engine autopilot
- `_spec_find_next_player` — internal cycle

`spec_player`, `spec_follow`, `spec_track <name>` — none of these exist on cs16-client.

## The fix — engine-level field write

GoldSrc stores the spectator's observer state in two pev fields on the spectator
player entity:

- `pev_iuser1` — observer mode (0=none, 1=in-eye, 2=chase, 3=free, 4=auto-chase)
- `pev_iuser2` — observed entity index (target player entindex)

Writing both via fakemeta `set_pev` moves the camera with no dependency on the
client console:

```pawn
#define OBS_CHASE 4

set_pev(spec_id, pev_iuser1, OBS_CHASE);
set_pev(spec_id, pev_iuser2, target_id);
engclient_cmd(spec_id, "spec_autodirector", "0");  // stop engine from stealing focus
```

This is robust because the engine reads these fields every think tick to decide
where to render the spec camera. The console-command path is just a thin frontend
that ends up writing the same fields.

## Additional invariant — target must be alive

`pev_iuser2 = target_id` only works while the target player is in-game and alive.
If they are dead, the engine snaps you back to the death-cam of whoever you were
observing previously. The plugin now guards with `is_user_alive(target_id)` before
applying the switch.

## Generalization

For any future "remote-control the headless spec" feature, prefer the engine-field
path over `engclient_cmd`. Test the assumption that a Steam-client console command
exists on cs16-client by checking the source at `/opt/cs-stream/cs16-client/cl_dll/`
or by running `cmdlist spec` in the spectator console — if it does not appear,
you have to go through pev.

## See also

- `infra/cs-plugins/jbf_forum_spectator.sma` — current plugin source
- `infra/cs-stream/spectator-start.sh` — headless client launch
- Commit `8997665` — the v0.5 → v0.6 swap
