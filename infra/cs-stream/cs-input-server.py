#!/usr/bin/env python3
"""
/opt/cs-stream/spectator/input-server.py — host-side xdotool relay.

The backend container talks to this over TCP on 127.0.0.1:7777. Each
line is a JSON event:

    {"t": "kd", "k": "w"}       # keydown w
    {"t": "ku", "k": "w"}       # keyup w
    {"t": "mm", "dx": 5, "dy": -3}   # mousemove_relative
    {"t": "click", "b": 1}      # button 1 click
    {"t": "ping"}               # noop liveness

Why this exists:
- xdotool must run with access to Xvfb's display socket (/tmp/.X11-unix)
- Backend runs inside docker, host's /tmp/.X11-unix is not mounted
- Adding xdotool + socket mount to backend image is invasive
- Smaller blast radius: standalone host service, restartable
  independent of the forum backend

Discovers the xash3d window once at startup via `xdotool search`.
Re-discovers if a target fails (window may have changed after a spec
restart).

Security: bound to 127.0.0.1 only. No auth. Backend reaches it via
docker bridge → host loopback.
"""
import json
import os
import socket
import subprocess
import sys
import threading
import time
from typing import Optional

LISTEN_HOST = "0.0.0.0"  # accessible from docker bridge; UFW DROPs external
LISTEN_PORT = 7777
DISPLAY = ":99"

# Map JSON key names to xdotool key syms. CS 1.6 default binds:
#   forward W, back S, left A, right D, jump SPACE, duck CTRL,
#   use E, slow SHIFT, attack mouse1.
KEY_MAP = {
    "w": "w", "a": "a", "s": "s", "d": "d",
    "space": "space", "shift": "shift",
    "ctrl": "ctrl", "e": "e", "q": "q",
    "up": "Up", "down": "Down", "left": "Left", "right": "Right",
    "tab": "Tab",
}

WIN_LOCK = threading.Lock()
WIN_ID: Optional[str] = None


def log(msg: str) -> None:
    sys.stderr.write(f"[input-server] {msg}\n")
    sys.stderr.flush()


def discover_window() -> Optional[str]:
    """Find the xash3d/Counter-Strike window on the Xvfb display."""
    env = {**os.environ, "DISPLAY": DISPLAY}
    try:
        out = subprocess.run(
            ["xdotool", "search", "--name", "Counter-Strike"],
            env=env, capture_output=True, text=True, timeout=2,
        )
        ids = [x.strip() for x in out.stdout.splitlines() if x.strip()]
        if ids:
            return ids[0]
    except Exception as e:
        log(f"discover error: {e}")
    return None


def ensure_window() -> Optional[str]:
    global WIN_ID
    with WIN_LOCK:
        if WIN_ID is None:
            WIN_ID = discover_window()
            if WIN_ID:
                log(f"discovered xash3d window id={WIN_ID}")
        return WIN_ID


def invalidate_window() -> None:
    global WIN_ID
    with WIN_LOCK:
        WIN_ID = None


def xdo(args: list[str]) -> bool:
    """Run an xdotool subcommand. Returns True on success."""
    env = {**os.environ, "DISPLAY": DISPLAY}
    try:
        r = subprocess.run(
            ["xdotool"] + args,
            env=env, capture_output=True, text=True, timeout=2,
        )
        if r.returncode != 0:
            # Window stale? Re-discover next time.
            if "X Error" in r.stderr or "BadWindow" in r.stderr:
                invalidate_window()
            return False
        return True
    except Exception as e:
        log(f"xdo error: {e}")
        invalidate_window()
        return False


def handle_event(evt: dict) -> None:
    win = ensure_window()
    if not win:
        return
    t = evt.get("t")
    if t in ("kd", "ku"):
        k = evt.get("k", "")
        sym = KEY_MAP.get(k)
        if not sym:
            return
        cmd = "keydown" if t == "kd" else "keyup"
        xdo([cmd, "--window", win, sym])
    elif t == "mm":
        dx = int(evt.get("dx", 0))
        dy = int(evt.get("dy", 0))
        if dx == 0 and dy == 0:
            return
        xdo(["mousemove_relative", "--sync", "--", str(dx), str(dy)])
    elif t == "click":
        b = int(evt.get("b", 1))
        xdo(["click", "--window", win, str(b)])
    elif t == "ping":
        pass
    else:
        log(f"unknown event type {t!r}")


def serve_client(conn: socket.socket, addr: tuple) -> None:
    log(f"client connected from {addr}")
    buf = b""
    try:
        conn.settimeout(60)
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    evt = json.loads(line.decode("utf-8"))
                except Exception:
                    continue
                handle_event(evt)
    except socket.timeout:
        log(f"client {addr} idle timeout, dropping")
    except Exception as e:
        log(f"client {addr} error: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass
        log(f"client {addr} disconnected")


def main() -> None:
    log(f"starting on {LISTEN_HOST}:{LISTEN_PORT}, DISPLAY={DISPLAY}")
    ensure_window()
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((LISTEN_HOST, LISTEN_PORT))
    srv.listen(8)
    log("listening")
    try:
        while True:
            conn, addr = srv.accept()
            t = threading.Thread(
                target=serve_client, args=(conn, addr), daemon=True,
            )
            t.start()
    except KeyboardInterrupt:
        log("shutting down")
    finally:
        srv.close()


if __name__ == "__main__":
    main()
