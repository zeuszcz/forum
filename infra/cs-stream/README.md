# cs-stream — live spectator video pipeline

Phased rollout of the `/live` page's video-feed half. The schematic
top-down canvas already runs on the WS ephemeral pipeline; this adds
the actual game video next to it.

## Pipeline shape

```
game server (37.230.228.248:27015)
   ↓ regular CS spectator client protocol
xash3d-fwgs i386 (headless, Xvfb display :99)
   ↓ ffmpeg x11grab + libx264
MediaMTX  ── (RTMP 127.0.0.1:1935  →  LL-HLS 127.0.0.1:8888)
   ↓ nginx /stream/ proxy
hls.js in /live   ── browser <video>
```

The original plan also had an HLTV proxy (Phase S2) sitting between
the game server and the headless client. We **dropped HLTV** because
the game server actively rejects HLTV proxies with `"Sorry, HLTV is
not allowed on this server"` despite `sv_proxies=1`. Connecting as a
regular spectator-team player works around the rejection and uses
one normal player slot (32 max, typically 1-10 used).

## Phase status

| Phase | What | Status |
|-------|------|--------|
| S1    | MediaMTX relay + nginx route + hls.js StreamPlayer skeleton | **shipped** (94055eb) |
| S2    | HLTV proxy | **abandoned** (server-side rejection, no plugin diagnostics access) |
| S3.1  | xash3d-fwgs i386 AppImage extracted, valve/cstrike symlinked, systemd unit drafted | **WIP** (this commit) |
| S3.2  | xash3d-fwgs lands in CLIENT mode (currently dedicated) and joins spectator team | **blocked** — see below |
| S4    | ffmpeg x11grab → RTMP push to MediaMTX | pending S3.2 |
| S5    | On-demand orchestrator (start/stop on viewer presence) | pending S4 |
| S6    | systemd watchdog + Grafana + recovery | pending S5 |

## S3.2 blocker — xash3d-fwgs runs as dedicated server, not client

Symptom: every boot, the engine reaches `Type 'map <mapname>' to start
game...` and execs `cstrike/server.cfg`. The client console commands
(`connect`, `name`, `sensitivity`) come back as `Unknown command` —
they only exist when the client subsystem is active.

What we tried in S3.1, none of which flipped to client mode:

- launching with `-game cstrike -console -dev 1 +connect …`
- moving the connect to `cstrike/userconfig.cfg`
- moving the connect to `cstrike/config.cfg`
- dropping `-console`, adding `-window -ref soft`
- explicit `DISPLAY=:99` with Xvfb 1280x720x24 +extension GLX +render

Likely root cause: **xash3d-fwgs auto-falls-back to dedicated mode
when GL context fails to initialise against the Xvfb display**.
Xvfb-without-real-GL is the most common reason. A real OpenGL context
via Mesa software, or running through `xvfb-run`, or pointing
`SDL_VIDEODRIVER=offscreen`, may help.

### Unblockers to try next session

1. `LIBGL_ALWAYS_SOFTWARE=1` + `MESA_GL_VERSION_OVERRIDE=2.1` to force
   Mesa's software OpenGL renderer (`llvmpipe`), guaranteed to work
   without a GPU.
2. `xvfb-run -a -s "-screen 0 1280x720x24 +extension GLX +render"`
   wrapper (handles Xvfb lifecycle correctly).
3. `SDL_VIDEODRIVER=offscreen` to bypass X11 entirely (newer xash3d-fwgs
   may support this).
4. **Pivot to Wine + Steam CS 1.6 client** — the proven path.
   Costs ~1GB RAM (we have 1.9GB free) but client/server detection
   is rock solid because the original Windows client is the
   reference implementation.
5. **Reuse HLDS as listen-server + bind to a fake client** — Daemonise
   HLDS with a single bot whose POV gets captured. Ugly but stays
   in-engine.

## What's in this directory (committed to git)

```
infra/cs-stream/
├── README.md                  this file (the pipeline + phase matrix + blocker notes)
├── docker-compose.yml         MediaMTX relay (Phase S1)
├── mediamtx.yml               LL-HLS config (Phase S1)
├── hltv.cfg                   HLTV proxy config (Phase S2, abandoned)
├── cs-hltv-proxy.service      HLTV systemd unit (not in use, Phase S2 abandoned)
├── spectator-start.sh         Phase S3 launcher: Xvfb + xash3d-fwgs in client mode
├── spectator.cfg              cstrike-side userconfig: name + spec team auto-join
└── cs-spectator.service.draft systemd unit for spectator pipeline
```

Big artifacts on the VPS but **not committed** (too large / installable):

```
/opt/cs-stream/
├── hlds/                       ~820MB — HLDS install via steamcmd app 90
├── steamcmd/                   ~3MB — installer
├── spectator/
│   ├── squashfs-root/          ~30MB — xash3d-fwgs i386 AppImage extracted
│   │   ├── xash + libs
│   │   ├── valve/  → /opt/cs-stream/hlds/valve  (symlink)
│   │   └── cstrike/ → /opt/cs-stream/hlds/cstrike (symlink)
│   └── start.sh                from infra/cs-stream/spectator-start.sh
└── mediamtx/                   symlinked from infra/cs-stream/mediamtx.yml
```

## Smoke-test the relay (Phase S1, works today)

```bash
ssh site-vps
ffmpeg -re -f lavfi -i "testsrc=854x480:rate=30" \
       -c:v libx264 -preset ultrafast -tune zerolatency -g 60 \
       -f flv rtmp://127.0.0.1:1935/cs1
# In another shell:
curl http://127.0.0.1:8888/cs1/index.m3u8   # should return 200 with manifest
```

Then the StreamPlayer on `/live` (toggle in the header) will pick the
feed up via nginx and play it.

## Resuming next session

The next session should:
1. unblock Phase S3.2 (try `LIBGL_ALWAYS_SOFTWARE=1` first; if that
   fails, pivot to Wine + Steam CS 1.6 client)
2. once xash3d/Wine boots into the client menu and auto-runs
   `connect 37.230.228.248:27015`, verify it appears on the game
   server's `status` output as a spectator
3. ship Phase S4: ffmpeg pipeline
4. ship Phase S5: on-demand orchestrator
5. ship Phase S6: monitoring + watchdog
