#!/bin/bash
# /opt/cs-stream/spectator/start.sh — Phase S3 launcher (WIP).
#
# Boots xash3d-fwgs (i386) headless client in Xvfb :99 and tries to
# auto-connect to the game server as a spectator-team player.
#
# Status: xash3d-fwgs starts but lands in dedicated mode instead of
# client mode. Removing -console + adding -window + -ref soft to force
# client path; needs verification next session.

set -u

ROOT=/opt/cs-stream/spectator/squashfs-root
EXTRAS=/tmp/extras.pk3
GAME_SERVER="37.230.228.248:27015"
DISPLAY_NUM=:99

Xvfb $DISPLAY_NUM -screen 0 1280x720x24 -ac +extension GLX +render -nolisten tcp &
XVFB_PID=$!

sleep 1

cleanup() {
    kill -- "$XVFB_PID" 2>/dev/null || true
    pkill -P $$ -f xash 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$ROOT"
exec env \
    DISPLAY="$DISPLAY_NUM" \
    XASH3D_BASEDIR="$ROOT" \
    XASH3D_EXTRAS_PAK1="$EXTRAS" \
    LD_LIBRARY_PATH="$ROOT" \
    SDL_VIDEODRIVER=x11 \
    ./xash \
        -game cstrike \
        -window \
        -ref soft \
        -width 1280 -height 720 \
        -dev 1 \
        +exec spectator.cfg
