#!/bin/bash
# /opt/cs-stream/spectator/start.sh — Phase S3+S4 launcher (v6).
#
# v5 → v6: drop `-dev 1` from the xash3d command line. Developer mode
# routes engine warnings (notably "Overflow 500 temporary ents!" from
# CL_TempEntAlloc when a busy round saturates the tempent ring buffer)
# through Con_DPrintf, which the HUD echoes onto the visible notify
# overlay. The encoder then bakes that text into the stream that gets
# pushed to viewers. We do not need dev console for production —
# qconsole.log via `-log` still captures every line for debugging.

set -u

ROOT=/opt/cs-stream/spectator/squashfs-root
EXTRAS=/tmp/extras.pk3
DISPLAY_NUM=:99
WIDTH=854
HEIGHT=480

Xvfb $DISPLAY_NUM -screen 0 ${WIDTH}x${HEIGHT}x24 -ac +extension GLX +render -nolisten tcp &
XVFB_PID=$!
sleep 1

cleanup() {
    kill -- "$XVFB_PID" 2>/dev/null || true
    pkill -P $$ -f xash3d 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$ROOT"
exec env \
    DISPLAY="$DISPLAY_NUM" \
    XASH3D_BASEDIR="$ROOT" \
    XASH3D_EXTRAS_PAK1="$EXTRAS" \
    LD_LIBRARY_PATH="$ROOT:/opt/cs-stream/hlds" \
    SDL_VIDEODRIVER=x11 \
    LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe \
    MESA_GL_VERSION_OVERRIDE=2.1 \
    MESA_GLSL_VERSION_OVERRIDE=120 \
    ./xash3d \
        -game cstrike \
        -window \
        -ref soft \
        -width $WIDTH -height $HEIGHT \
        -log
