#!/usr/bin/env python3
"""
/opt/cs-stream/spectator/input-server.py — host-side xdotool relay v2.

v2 — latency kill.

  v1 spawned a fresh `xdotool` subprocess for every key/mouse event.
  fork+exec ate ~5-30 ms per event. With WASD + 60 Hz mouselook this
  added up to ~200 ms cumulative delay on top of the network RTT.
  Painful in pilot mode.

  v2 keeps ONE persistent xdotool subprocess (`xdotool -`, which reads
  commands from stdin) per server lifetime. Each event is now a single
  newline-write to the subprocess's stdin pipe: <100 us. Same
  pipeline, ~2 orders of magnitude faster.

Wire format unchanged from v1. Each TCP line is a JSON event:

    {"t": "kd", "k": "w"}       # keydown w
    {"t": "ku", "k": "w"}       # keyup w
    {"t": "mm", "dx": 5, "dy": -3}   # mousemove_relative (pointerlock)
    {"t": "click", "b": 1}      # button 1 click
    {"t": "ping"}               # noop liveness

Discovers the xash3d window once at startup via `xdotool search`.
Re-discovers + restarts the xdotool subprocess if a target fails
(window can change after a spec restart).

Security: bound to 0.0.0.0 — UFW restricts to docker bridge.
"""
import json
import os
import socket
import subprocess
import sys
import threading
from typing import Optional

LISTEN_HOST = "0.0.0.0"
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

_LOCK = threading.Lock()
_PROC: Optional[subprocess.Popen] = None
_WIN_ID: Optional[str] = None


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


def start_xdotool() -> Optional[subprocess.Popen]:
    """Spawn a persistent `xdotool -` subprocess that reads commands
    from stdin. Each newline-terminated line is one xdotool command.

    We pipe stdout/stderr to DEVNULL so the process doesn't fill up
    on us if no one reads them."""
    env = {**os.environ, "DISPLAY": DISPLAY}
    try:
        proc = subprocess.Popen(
            ["xdotool", "-"],
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
        log(f"started persistent xdotool subprocess pid={proc.pid}")
        return proc
    except Exception as e:
        log(f"xdotool spawn error: {e}")
        return None


def ensure_pipeline() -> bool:
    """Make sure the window id is known and the xdotool subprocess is
    alive. Returns True on success."""
    global _PROC, _WIN_ID
    with _LOCK:
        if _WIN_ID is None:
            _WIN_ID = discover_window()
            if _WIN_ID:
                log(f"discovered xash3d window id={_WIN_ID}")
        if _WIN_ID is None:
            return False
        if _PROC is None or _PROC.poll() is not None:
            if _PROC is not None:
                log(f"xdotool subprocess died (rc={_PROC.poll()}), restarting")
            _PROC = start_xdotool()
        return _PROC is not None and _PROC.poll() is None


def send_xdo(cmd_line: str) -> None:
    """Write one xdotool command line to the persistent subprocess."""
    global _PROC
    if not ensure_pipeline():
        return
    try:
        assert _PROC is not None and _PROC.stdin is not None
        _PROC.stdin.write((cmd_line + "\n").encode("utf-8"))
        _PROC.stdin.flush()
    except (BrokenPipeError, OSError) as e:
        log(f"xdotool stdin error: {e}, will restart on next call")
        with _LOCK:
            _PROC = None


def handle_event(evt: dict) -> None:
    t = evt.get("t")
    win = _WIN_ID
    if win is None:
        # First-call discovery.
        ensure_pipeline()
        win = _WIN_ID
        if win is None:
            return
    if t in ("kd", "ku"):
        k = evt.get("k", "")
        sym = KEY_MAP.get(k)
        if not sym:
            return
        cmd = "keydown" if t == "kd" else "keyup"
        send_xdo(f"{cmd} --window {win} {sym}")
    elif t == "mm":
        dx = int(evt.get("dx", 0))
        dy = int(evt.get("dy", 0))
        if dx == 0 and dy == 0:
            return
        # mousemove_relative does NOT need a window target — works
        # on the X pointer. `--sync` would block until the X server
        # confirms, which adds latency. Async (default) is fine for
        # mouselook because subsequent moves will overwrite intent
        # on the engine side anyway.
        send_xdo(f"mousemove_relative -- {dx} {dy}")
    elif t == "click":
        b = int(evt.get("b", 1))
        send_xdo(f"click --window {win} {b}")
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
    ensure_pipeline()
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
        if _PROC is not None:
            try:
                _PROC.terminate()
            except Exception:
                pass


if __name__ == "__main__":
    main()
