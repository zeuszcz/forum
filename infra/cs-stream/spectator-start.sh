#!/bin/bash
# /opt/cs-stream/spectator/start.sh — Phase S3+S4 launcher (v7).
#
# v7 — adds audio output. The headless VPS has no real sound card, so
# we run a per-user PulseAudio daemon and create a `cs_audio` null sink
# that xash3d writes into. The encoder (cs-encoder.service) reads back
# from `cs_audio.monitor` to mux AAC audio into the HLS stream.
#
# Why PulseAudio:
#   - SDL2 (which xash3d-fwgs uses for audio) speaks pulse natively.
#   - Null-sink + monitor = a virtual loopback that needs no kernel
#     module (vs snd-aloop which the VPS provider does not allow).
#
# Why per-user (not system-wide pulse):
#   - System pulse usually requires root + careful AppArmor wiring.
#     Per-user runs entirely inside /run/user/$UID which systemd
#     already creates for the service's User= directive.
#
# v6 → v7 changes:
#   - pulse daemon + null sink setup before xash3d launch.
#   - SDL_AUDIODRIVER=alsa in the xash3d env.

set -u

ROOT=/opt/cs-stream/spectator/squashfs-root
EXTRAS=/tmp/extras.pk3
DISPLAY_NUM=:99
WIDTH=854
HEIGHT=480

# ----------------------------------------------------------------
# Pulse audio setup — null sink the encoder will record from.
# ----------------------------------------------------------------
# XDG_RUNTIME_DIR is set by systemd via PAM; default to /run/user/$UID
# if we're invoked outside a systemd context (debugging from a shell).
: "${XDG_RUNTIME_DIR:=/run/user/$(id -u)}"
export XDG_RUNTIME_DIR

# Kill any stale pulse daemon from a previous run.
pulseaudio --kill 2>/dev/null || true
sleep 0.5
pulseaudio --start --exit-idle-time=-1 --log-target=stderr 2>&1 | head -5 || true
# Wait briefly for the daemon socket to appear.
for i in 1 2 3 4 5 6 7 8 9 10; do
    pactl info >/dev/null 2>&1 && break
    sleep 0.3
done

# Create a null sink the game will write to; the .monitor source is
# what ffmpeg captures.
pactl load-module module-null-sink sink_name=cs_audio \
    sink_properties=device.description=CS_Audio >/dev/null 2>&1 || true
pactl set-default-sink cs_audio >/dev/null 2>&1 || true
echo "[FORUM] pulse default sink: $(pactl get-default-sink 2>/dev/null)"

# ----------------------------------------------------------------
# Xvfb display.
# ----------------------------------------------------------------
Xvfb $DISPLAY_NUM -screen 0 ${WIDTH}x${HEIGHT}x24 -ac +extension GLX +render -nolisten tcp &
XVFB_PID=$!
sleep 1

cleanup() {
    kill -- "$XVFB_PID" 2>/dev/null || true
    pkill -P $$ -f xash3d 2>/dev/null || true
    pulseaudio --kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$ROOT"
exec env \
    DISPLAY="$DISPLAY_NUM" \
    XASH3D_BASEDIR="$ROOT" \
    XASH3D_EXTRAS_PAK1="$EXTRAS" \
    LD_LIBRARY_PATH="$ROOT:/opt/cs-stream/hlds" \
    SDL_VIDEODRIVER=x11 \
    SDL_AUDIODRIVER=alsa \
    PULSE_SINK=cs_audio \
    LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe \
    MESA_GL_VERSION_OVERRIDE=2.1 \
    MESA_GLSL_VERSION_OVERRIDE=120 \
    XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
    ./xash3d \
        -game cstrike \
        -window \
        -ref soft \
        -width $WIDTH -height $HEIGHT \
        -log
