---
name: Headless spec gets kicked by ProcessCmds anti-speedhack
description: Why the headless xash3d spec needs explicit cl_cmdrate / cl_updaterate caps to survive the jail server's ProcessCmds meta-mod plugin
type: regression
tags: [cs1.6, xash3d, processcmds, anti-cheat, spectator, userconfig]
updated: 2026-05-12
---

# Headless spec gets kicked by ProcessCmds anti-speedhack

## Context

The jail game server loads **ProcessCmds v1.2.0.6** as a meta-mod plugin (visible
in `meta list`). It is a server-side anti-speedhack that watches the rate of
`usercmd` packets per client. When a client sends a *burst* of cmd packets in a
short time window, ProcessCmds kicks them with:

```
Server issued disconnect, Reason: Banned for move commands flooding (burst)
```

This is not a persistent ban — `listid` / `listip` stay empty — but every
reconnect attempt gets kicked again under the same load profile, which turns
the headless spec into a useless 5-second flicker on the stream.

## Symptoms

- `[Xash3D]forum_spectator` connects fine, renders the menu and the spawn
  point.
- After a few rounds — sometimes within seconds, sometimes after several
  minutes — the spec disappears from `status` while the `xash3d` process on the
  VPS stays alive (so systemd `Restart=on-failure` does **not** fire).
- The spectator's dev console (visible because xash3d runs with `-dev 1`)
  shows the disconnect line over the last rendered frame; the encoder happily
  publishes that frozen frame to MediaMTX until somebody restarts the service.

## Root cause

xash3d-fwgs in headless mode obeys `fps_max` for rendering, but the underlying
**input loop generates a usercmd packet per simulation tick**. Without explicit
`cl_cmdrate` / `cl_updaterate` caps, the engine defaults to higher rates
(30 / 60). Combined with the engine catching up on missed ticks after any X11
hiccup (Xvfb redraw, ffmpeg grabber pause, our AMX plugin `engclient_cmd`
storm during `force_spec`), the spec emits a brief burst that exceeds
ProcessCmds' allowed budget.

## The fix — userconfig v3

In `/opt/cs-stream/hlds/cstrike/userconfig.cfg` (mirrored in
`infra/cs-stream/userconfig.cfg`):

```cfg
fps_max 30
cl_cmdrate 15
cl_updaterate 15
rate 7500
sensitivity 0
m_pitch 0
m_yaw 0
```

`cl_cmdrate 15` caps client → server usercmd packets at 15 / s, which is well
below any plausible burst threshold and is sufficient for spectator-only
viewing. `sensitivity 0` plus zeroed mouse axes guarantee no stray view-angle
delta ever turns into a `+look` cmd.

## What does NOT fix it

- `fps_max` alone is insufficient — the cmd packet rate is decoupled from
  render fps in headless mode.
- Adding `+reconnect` to the CFG: xash3d has no on-disconnect hook to
  retrigger a CFG, so a reconnect alias never runs.
- `Restart=on-failure` in systemd: xash3d stays alive after a kick, just on
  the menu screen, so systemd sees no failure.

## Proper auto-recovery — Phase S6

The Phase S6 watchdog should poll `rcon status` every 30 s, check for
`forum_spectator` in the player list, and `systemctl restart cs-spectator` if
it has fallen off. The watchdog cannot live inside the CFG; it has to be an
external process with access to the backend's `cs_rcon.execute`.

## Reproduction / verification

```
ssh site-vps 'docker exec endless-war-backend-1 python -c "
import asyncio; from app.services import cs_rcon
print(asyncio.run(cs_rcon.execute(\"status\", timeout=4.0)).output)
"'
```

Look for the `# N "[Xash3D]forum_spectator"` row. If absent → kicked, restart
`cs-spectator.service`. If present and `time` field keeps growing across
polls → throttle is working.

## See also

- `infra/cs-stream/userconfig.cfg` — current spec userconfig (v3)
- `concepts/headless-spectator-target-control.md` — sibling fix in same domain
- Commit `02861c5` — userconfig v3 hardening
- Commit `8997665` — plugin v0.6 (the previous spec fix, which may have been
  *contributing* to the cmd burst through repeated `force_spec` engclient_cmd
  storms; needs further investigation if the v3 throttle alone is not enough)
