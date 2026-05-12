#!/bin/bash
# /opt/cs-stream/spectator/start.sh — Phase S3 launcher (v4).
#
# Discovery: the 4MB `xash` binary is XashDS (dedicated server). The
# CLIENT launcher is the tiny `xash3d` binary which dlopens
# libxash.so. The AppImage's AppRun wraps it. Use it directly here.

set -u

ROOT=/opt/cs-stream/spectator/squashfs-root
EXTRAS=/tmp/extras.pk3
DISPLAY_NUM=:99

Xvfb $DISPLAY_NUM -screen 0 1280x720x24 -ac +extension GLX +render -nolisten tcp &
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
        -width 1280 -height 720 \
        -dev 1 \
        -log
