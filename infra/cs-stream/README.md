# cs-stream — live spectator video pipeline

End-to-end live video of the CS 1.6 jail server, rendered inside the
forum's `/live` page next to the schematic top-down canvas. Built on
**xash3d-fwgs + cs16-client + ffmpeg x11grab + MediaMTX + LL-HLS**.

## Pipeline shape

```
game server (37.230.228.248:27015)
   ↓ regular CS 1.6 spectator-team protocol
xash3d-fwgs i386 (headless in Xvfb :99, software-GL via Mesa llvmpipe)
  • drop-in cs16-client.so (built from source for xash3d-fwgs compat)
  • valve/ + cstrike/ assets bind-symlinked from /opt/cs-stream/hlds/
  • auto-connect via cstrike/userconfig.cfg
   ↓ x11grab capture of Xvfb root window
ffmpeg (libx264 ultrafast zerolatency, 720p30, 1.5 Mbps)
   ↓ RTMP push 127.0.0.1:1935/cs1
MediaMTX 1.9.3 (host network, record:false, 256MB cap)
   ↓ LL-HLS 127.0.0.1:8888/cs1/index.m3u8
nginx /stream/ proxy (no-cache on manifest, proxy_buffering off)
   ↓
hls.js in /live (toggle "Stream" in HUD header)
```

## Phase status — SHIPPED

| Phase | What | Status |
|-------|------|--------|
| S1    | MediaMTX + LL-HLS + nginx route + hls.js StreamPlayer | ✅ (94055eb) |
| S2    | HLTV proxy | ❌ abandoned — server rejects HLTV |
| S3    | Headless CS 1.6 client connecting as spectator | ✅ |
| S4    | ffmpeg x11grab → RTMP to MediaMTX | ✅ |

Remaining (next session):

| Phase | What |
|-------|------|
| S5    | On-demand orchestrator (start/stop pipeline on viewer presence) |
| S6    | systemd watchdog + Grafana + crash recovery |

## How Phase S3 was unblocked

The headless CS 1.6 client path took five gotchas in series. Captured
here so the next maintainer doesn't re-trip them:

1. **`xash` vs `xash3d` binary**. The 4 MB `xash` binary in the
   xash3d-fwgs i386 AppImage is **XashDS** (dedicated server). The
   28 KB `xash3d` next to it is the client launcher that dlopens
   `libxash.so`. Use that one.

2. **Mesa software OpenGL**. Pure Xvfb has no GL. xash3d-fwgs falls
   back to dedicated mode when GL context init fails. Force Mesa's
   llvmpipe via env: `LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe
   MESA_GL_VERSION_OVERRIDE=2.1 MESA_GLSL_VERSION_OVERRIDE=120`. Plus
   install `libgl1-mesa-dri:i386` for i386 swrast support.

3. **`libsteam_api.so` must be on LD_LIBRARY_PATH**. CS 1.6's
   `client.so` links against it; lives in the HLDS install.
   `LD_LIBRARY_PATH=$ROOT:/opt/cs-stream/hlds` does it.

4. **Steam-bundled `client.so` segfaults on KeyValues**. The CS 1.6
   client.so from `app_update 90` calls `KeyValues::operator new` in
   `BuyPresetManager::Reset()` early in `CHud::Init`; the allocator
   semantics don't match xash3d-fwgs's. Replace with **cs16-client**
   (SNMetamorph/cs16-client) — open-source, xash3d-fwgs-compatible
   reimplementation. Built from source with `cmake -DCMAKE_C_FLAGS=-m32
   -DCMAKE_CXX_FLAGS=-m32` against `gcc-multilib + libsdl2-dev:i386 +
   libfreetype-dev:i386 + pkg-config`. Drop the resulting `client.so`
   into `cstrike/cl_dlls/`.

5. **Server precaches files it doesn't have**. The server hands the
   client a precache list containing references to custom-plugin
   assets (`sprites/custom_weapon/ethereal/*.spr`, `models/jbff/arrow.mdl`,
   etc.) that are missing from its FTP and have no `sv_downloadurl`
   fallback. Client downloads each, fails, and disconnects.

   Workarounds (applied):
   - Pre-populate `/opt/cs-stream/hlds/cstrike/{sprites,models,sound,maps}`
     from FTP via `lftp -e "mirror --use-cache --only-newer ..."`. Roughly
     ~700 MB total.
   - For the handful of files that don't exist on FTP either, write
     **empty stub files** at the expected paths. Zero-byte files satisfy
     the consistency check and the client proceeds.

## Files in this directory

```
infra/cs-stream/
├── README.md                  this file
├── docker-compose.yml         MediaMTX compose (Phase S1)
├── mediamtx.yml               LL-HLS config (Phase S1)
├── hltv.cfg                   abandoned HLTV proxy cfg (Phase S2)
├── cs-hltv-proxy.service      abandoned HLTV systemd unit
├── spectator-start.sh         start.sh: Xvfb + xash3d-fwgs with all env vars
├── spectator.cfg              cstrike-side cfg (deprecated, kept for refrence)
├── userconfig.cfg             cstrike/userconfig.cfg — fires `connect` after engine ready
├── cs-spectator.service       systemd unit for the headless client
└── cs-encoder.service         systemd unit for ffmpeg x11grab → RTMP
```

## Big artefacts on the VPS (not in git)

```
/opt/cs-stream/
├── hlds/                      ~820 MB — HLDS install via steamcmd app 90
│   ├── cstrike/maps/          ~622 MB — synced from FTP
│   ├── cstrike/sprites/       ~26 MB  — synced from FTP
│   ├── cstrike/models/        ~42 MB  — synced from FTP
│   ├── cstrike/sound/         ~18 MB  — synced from FTP
│   └── cstrike/cl_dlls/client.so — replaced with cs16-client build
├── steamcmd/                  ~3 MB — steamcmd installer
├── spectator/
│   ├── squashfs-root/         ~80 MB — xash3d-fwgs AppImage extracted
│   │   ├── xash3d + libs
│   │   ├── valve/   → /opt/cs-stream/hlds/valve
│   │   └── cstrike/ → /opt/cs-stream/hlds/cstrike
│   └── start.sh               mirrored from infra/cs-stream/spectator-start.sh
└── cs16-client/               cloned source, built client.so installed into cstrike
```

## How to bring the pipeline up

```bash
ssh site-vps
sudo systemctl start cs-stream-mediamtx     # MediaMTX relay (docker compose service)
sudo systemctl start cs-spectator           # Xvfb + xash3d-fwgs spectator
sudo systemctl start cs-encoder             # ffmpeg encoder
# Verify
sudo docker exec endless-war-backend-1 python -c "
import asyncio
from app.services import cs_rcon
async def main():
    r = await cs_rcon.execute('status', timeout=5.0)
    print(r.output)
asyncio.run(main())
"
# You should see a row like:
#   [Xash3D]forum_spectator   STEAM_xx:y:zzzzz  170.168.72.200:NNNNN
curl http://127.0.0.1:8888/cs1/index.m3u8   # 200 with manifest
```

On the forum, open `/live` and click the `Stream` toggle in the header
— the video panel below the table picks up the LL-HLS feed via
`https://forum.innertalk.space/stream/cs1/index.m3u8`.

## Cost on the VPS

When the pipeline is running:

| Component | RAM | CPU | Notes |
|-----------|-----|-----|-------|
| MediaMTX | ~50-100 MB | <5% | Always on |
| Xvfb :99 | ~20 MB | <2% | One per spectator |
| xash3d-fwgs client | ~280 MB | 1 core | One per spectator |
| ffmpeg encoder | ~150 MB | 1 core | libx264 ultrafast 720p30 |
| **Total** | **~500 MB** | **~2 cores** | |

Phase S5 (next) will start/stop spectator+encoder on demand so this
only runs when someone is actually watching `/live`.

## Resuming next session

1. **Phase S5** — on-demand orchestrator. Backend `POST /live/stream/
   heartbeat` from the frontend pings every 30s while StreamPlayer is
   active. A background task watches the heartbeat; when nobody has
   pinged for 60s, `systemctl stop cs-spectator` (also stops the
   `PartOf=cs-spectator` encoder). On the next heartbeat, start them
   back up. Cold-start latency ~15 s.

2. **Phase S6** — monitoring + watchdog. Grafana panel showing
   `bytes/s` from MediaMTX `/v1/paths/list` REST endpoint, alert
   if 0 bytes for >30 s while the spectator is supposed to be live.
