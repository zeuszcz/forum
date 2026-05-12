# cs-stream — live spectator video pipeline

Phased rollout of the `/live` page's video-feed half. The schematic
top-down canvas already runs on the WS ephemeral pipeline; this adds
the actual game video next to it.

## Pipeline shape

```
game server (37.230.228.248:27015)
   ↓ HLTV protocol
hltv proxy  ── (127.0.0.1:27020)
   ↓ spectator client (TBD)
headless CS 1.6 in Xvfb  ── (display :99)
   ↓ ffmpeg x11grab + libx264
MediaMTX  ── (RTMP 127.0.0.1:1935  →  LL-HLS 127.0.0.1:8888)
   ↓ nginx /stream/ proxy
hls.js in /live   ── browser <video>
```

## Phase status

| Phase | What | Status |
|-------|------|--------|
| S1    | MediaMTX relay + nginx route + hls.js StreamPlayer skeleton | **shipped** (commit 94055eb) |
| S2.1  | HLDS install via steamcmd, hltv binary | **shipped** (this commit) |
| S2.2  | hltv.cfg with master+proxy modules, validated commands parse | **shipped** |
| S2.3  | HLTV proxy attaching to game server | **blocked** — see below |
| S3    | Headless CS 1.6 client (xash3d-fwgs preferred over Wine) | pending S2.3 |
| S4    | ffmpeg x11grab → RTMP push to MediaMTX | pending S3 |
| S5    | On-demand orchestrator (start/stop on viewer presence) | pending S4 |
| S6    | systemd watchdog + Grafana + recovery | pending S5 |

## S2.3 blocker — game server rejects HLTV

When HLTV proxy tries to attach, game server replies:

```
Connection rejected: Sorry, HLTV is not allowed on this server
```

All standard engine cvars are correctly set:

| cvar | value |
|------|-------|
| `sv_proxies` | `1` (allow 1 HLTV proxy) |
| `sv_lan` | `0` |
| `allow_spectators` | `1` |
| `sv_password` | empty (no pwd) |
| `listip` | empty (no IP bans) |
| `listid` | empty (no SteamID bans) |

Bypass Guard's `ip_list.ini` was already updated to whitelist the forum
VPS IP (`170.168.72.200`) with a `whitelist` entry; map was reloaded so
BG re-read the config. Rejection persisted.

The rejection text "HLTV is not allowed on this server" is **engine-level**
(not from an AMX plugin), so it shouldn't be hookable from AMX/meta.
With every engine cvar in the "allow" state, the remaining candidates
are:

1. A meta-plugin (SafeNameAndChat / Reunion / ProcessCmds / ReAPI)
   overriding the engine packet handler and pretending to be the engine.
2. A `re_*` / ReHLDS hidden cvar that defaults to deny.
3. A binding mismatch between our locally-compiled HLTV (steamcmd app 90)
   and the server's protocol expectations — though both reported protocol
   version 48.

### Next-session unblockers (need user / direct console access)

1. **Tail HLDS live console** — telnet/screen into the game server and
   watch a connect attempt. The Console will print which plugin (if any)
   intercepts the packet.
2. **Test without security stack** — temporarily comment out
   `security/bypass_guard.amxx`, `security/fresh_bans.amxx`,
   `security/anti_hpp.amxx`, `security/bg_*.amxx` in
   `addons/amxmodx/configs/plugins.ini`, restart server, retry HLTV. If
   it connects → it's a plugin. Re-enable plugins one at a time to find
   the offender.
3. **Inspect Reunion-side HLTV handling** — Reunion's `cid_Provider`
   defaults may not accept the HLTV ticket; setting `reunion.cfg
   cid_Provider 7` (Steam-only) might paradoxically allow HLTV through
   the Steam path.
4. **Ask hosting provider** — sometimes the host blocks HLTV TCP/UDP
   slot port (27020) at firewall level.

## What's in this directory (committed to git)

```
infra/cs-stream/
├── README.md                  this file
├── docker-compose.yml         MediaMTX relay (Phase S1)
├── mediamtx.yml               LL-HLS config (Phase S1)
├── hltv.cfg                   HLTV proxy config (Phase S2)
└── cs-hltv-proxy.service      systemd unit, ready to enable when S2.3 clears
```

Big artifacts not in git (on VPS only):

```
/opt/cs-stream/
├── hlds/                      ~820MB — HLDS install via steamcmd app 90
├── steamcmd/                  ~3MB — steamcmd installer
└── mediamtx/                  symlinked from infra/cs-stream/mediamtx.yml
```

## How to bring up the stream when S3+ ship

Once S2.3 unblocks (HLTV attaches), enable + start:

```bash
sudo systemctl enable cs-hltv-proxy.service
sudo systemctl start cs-hltv-proxy.service
sudo journalctl -u cs-hltv-proxy -f
```

Verify on game server:

```
rcon status   # should show HLTV proxy as a connected slot
```

Then S3-S5 spin up the encoder/orchestrator, and the StreamPlayer
toggle on `/live` will flip from "Spectator-pipeline пока не активен"
to live video.
