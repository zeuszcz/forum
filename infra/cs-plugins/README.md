# CS 1.6 AMX-X plugins for endless·war

These plugins extend the **game server** so that events the forum cares
about (positions, structured admin actions) reach the
`cs-log-listener` → forum WebSocket pipeline.

## jbf_position_dump.sma

Periodically dumps every alive player's position into the HLDS log.

The line format is consumed by `/opt/cs-log-listener/listener.py` and
broadcast over the forum WS as an `ephemeral_system` event with
`category=position` (no DB row). The `/live` page on the forum draws
a top-down minimap from these events with interpolation between ticks.

### Install

1. Copy `jbf_position_dump.sma` to your AMX-X install:
   `cstrike/addons/amxmodx/scripting/`

2. Compile it. Either:
   - Drop into your usual scripting flow (`compile.bat` /
     `amxxpc jbf_position_dump.sma`), or
   - Use the web compiler at <https://www.amxx-bg.info/compile> if you
     do not have the toolchain locally.

3. Place the resulting `jbf_position_dump.amxx` into:
   `cstrike/addons/amxmodx/plugins/`

4. Register it. Append to `cstrike/addons/amxmodx/configs/plugins.ini`:
   ```
   jbf_position_dump.amxx
   ```

5. Reload AMX-X (RCON):
   ```
   amxx pause
   amxx unpause
   ```
   or simply `changelevel <currentmap>`.

6. Verify in console:
   ```
   meta list
   ```
   The plugin should appear as `running` in the AMX-X column. Then run
   `amx_pos_dump` once via RCON and watch the HLDS console — you should
   see lines like `JBF_POS|123|512|-128|64|180|2|100|nickname`.

### Network sanity check

`log_message` writes to the HLDS log, which is mirrored over UDP to
`log_redirect_address`. Make sure your `server.cfg` (or `listenserver.cfg`)
has the cs-log-listener target wired up. On the forum VPS the listener
binds `0.0.0.0:27500` — use the public IP your game host can reach.

```
log on
mp_logfile 1
mp_logmessages 1
mp_logdetail 3
log_redirect_address <forum.vps.public.ip>:27500
```

`mp_logmessages 1` is the cvar that enables `log_message` output (most
plugins assume it's on). Without it the position lines never leave the
game server.

### Cvars (live tuneable via RCON)

| cvar                | default | meaning                                          |
|---------------------|---------|--------------------------------------------------|
| `jbf_pos_interval`  | `2.0`   | dump period in seconds (≥ 0.5)                   |
| `jbf_pos_enabled`   | `1`     | master toggle, set 0 to silence without unloading|

### RCON commands

| command            | who          | what                          |
|--------------------|--------------|-------------------------------|
| `amx_pos_dump`     | ADMIN_RCON   | force one dump right now      |
| `amx_pos_toggle`   | ADMIN_RCON   | flip `jbf_pos_enabled`        |

### Bandwidth note

With 32 players, the plugin writes 32 lines every 2 s. Each line is
~90 bytes, so the burst is ~3 KB / 2 s ≈ 1.5 KB/s outbound from the
game server to the listener. Trivial for jail traffic.

### Privacy / abuse note

The line format includes `userid`, `team`, `hp`, `nick`, and XYZ origin.
It does **not** include SteamID, IP, or the player's view target — the
forum gets just enough to draw a dot on a top-down map. If you ever
want to expose this on a public page (the forum's `/live` is currently
open to everyone), be aware that wallhack-style information is leaked
during an LR or sneak phase. Tighten the route to authenticated users
if your community treats positions as competitive info.
