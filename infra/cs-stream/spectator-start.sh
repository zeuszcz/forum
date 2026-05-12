#!/bin/bash
# /opt/cs-stream/spectator/start.sh — Phase S3+S4 launcher (v5).
#
# Match the headless display resolution to the encoder's capture size
# so x11grab's full grab IS the full Xvfb root; no top-left crop, no
# scale filter in ffmpeg. 854x480x24 also takes ~half the SHM and
# rendering work compared to 720p.

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
        -dev 1 \
        -log
