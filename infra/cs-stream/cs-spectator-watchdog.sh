#!/bin/bash
# /opt/cs-stream/spectator/watchdog.sh — Phase S6.
#
# Polls the game server via RCON every WATCHDOG_INTERVAL seconds and
# bounces cs-spectator.service if the forum_spectator client is
# missing from the player list. Catches the silent failure modes that
# systemd cannot:
#
#   1. xash3d-fwgs is on its menu screen because the server kicked it
#      (e.g. ProcessCmds "move commands flooding" burst). The process
#      is alive so `Restart=on-failure` never fires, but no spec is
#      actually on the server.
#
#   2. The bypass-guard / fresh-bans IP block kicked. xash3d retries
#      forever on its menu screen, no progress.
#
#   3. The map cycled to a passworded round (vote) and the spec did
#      not auto-rejoin.
#
# The watchdog ALSO enforces a cool-down between restarts — if the
# spec was bounced within the last LAST_RESTART_COOLDOWN seconds, we
# wait instead of stacking restarts that would only re-trigger
# ProcessCmds. State file: /run/cs-spectator-watchdog.last.

set -u

WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-30}"
LAST_RESTART_COOLDOWN="${LAST_RESTART_COOLDOWN:-120}"
SPEC_NICK_MATCH="${SPEC_NICK_MATCH:-forum_spectator}"
STATE_FILE="${STATE_FILE:-/run/cs-spectator-watchdog.last}"
LOG_FILE="${LOG_FILE:-/tmp/cs-spectator-watchdog.log}"

log() {
    echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"
}

is_spec_on_server() {
    # Use the running backend container to issue a status RCON call —
    # avoids needing to plumb RCON password into this script.
    local out
    out=$(docker exec endless-war-backend-1 python -c '
import asyncio, sys
from app.services import cs_rcon
async def go():
    try:
        r = await cs_rcon.execute("status", timeout=4.0)
        sys.stdout.write(r.output)
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(2)
asyncio.run(go())
' 2>/dev/null)
    if [[ -z "$out" ]]; then
        log "watchdog: RCON status returned nothing (server unreachable or banned)"
        return 2
    fi
    if echo "$out" | grep -q "$SPEC_NICK_MATCH"; then
        return 0
    fi
    return 1
}

cooldown_active() {
    if [[ ! -f "$STATE_FILE" ]]; then
        return 1
    fi
    local last now
    last=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
    now=$(date +%s)
    if (( now - last < LAST_RESTART_COOLDOWN )); then
        return 0
    fi
    return 1
}

mark_restart() {
    date +%s > "$STATE_FILE"
}

bounce_spec() {
    log "watchdog: bouncing cs-spectator.service"
    if /bin/systemctl restart cs-spectator; then
        mark_restart
        log "watchdog: restart issued OK"
    else
        log "watchdog: restart FAILED"
    fi
}

# One-shot mode — designed to be invoked from a systemd timer.
#
# We capture the function's exit code into rc explicitly. The earlier
# version relied on $? after `if fn; then exit 0; fi` which proved
# unreliable across runs (silent rc=2 paths never triggered the case
# branch). Belt-and-suspenders: every tick now logs a one-line
# heartbeat into a verbose log so we can audit cadence.
is_spec_on_server
rc=$?
echo "[$(date -Iseconds)] tick rc=$rc" >> /tmp/cs-spectator-watchdog-verbose.log

case $rc in
    0)
        # Spec present, all good.
        exit 0
        ;;
    1)
        log "watchdog: forum_spectator MISSING from server player list"
        if cooldown_active; then
            log "watchdog: cooldown active, skipping restart"
            exit 0
        fi
        bounce_spec
        ;;
    2)
        # RCON failed — could be: backend down, server restart in
        # progress, or IP ban. We still bounce the spec because in
        # practice an IP ban is the only case where bouncing makes
        # things worse and that comes with its own cooldown.
        log "watchdog: RCON unavailable (rc=2) — checking if spec service needs a kick"
        # If the spec service has been up but the rcon side is down,
        # bouncing won't help. But if both are down (game server
        # restart cycle), the spec WILL stay disconnected forever
        # unless we kick it. Apply cooldown to avoid burst.
        if cooldown_active; then
            log "watchdog: cooldown active, skipping restart"
            exit 0
        fi
        bounce_spec
        ;;
esac

exit 0

# Phase S6.1 — encoder presence check (added after MTX restart cascaded
# an encoder fail). If cs-encoder is in failed state and the spec is
# online, kick the encoder. Cooldown shared with spec to avoid bursts.
if systemctl is-failed --quiet cs-encoder.service; then
    if ! cooldown_active; then
        echo "[$(date -Iseconds)] encoder failed, kicking" >> "$LOG_FILE"
        /bin/systemctl reset-failed cs-encoder.service
        /bin/systemctl restart cs-encoder.service
        mark_restart
    fi
fi
