#!/usr/bin/env python3
"""
/opt/cs-stream/spectator/input-server.py — host-side X input relay v3.

v3 — direct X11 XTEST (no xdotool subprocess at all).

  v1 forked xdotool per event (5-30 ms each).
  v2 tried persistent `xdotool -` but it dies after each batch in
     practice — we ended up forking on every event AND paying a
     restart penalty. Worst of both worlds.

  v3 uses python-xlib's XTEST extension directly. Each key/mouse
  event is a single X protocol message: ~50-100 µs. No fork, no
  process, no stderr to drain.

Mouse handling:
  CS 1.6 / xash3d-fwgs only sees mouse motion when it has grabbed
  the X pointer (SDL_SetRelativeMouseMode). In headless mode the
  client doesn't grab — so raw `MotionNotify` events go nowhere.
  We convert "mm" deltas into Arrow-key HOLD/RELEASE, which the
  engine sees as +left / +right / +lookup / +lookdown via its
  default keybinds. Snap-y but reliable.

Wire format unchanged from v1/v2.

Security: bound to 0.0.0.0 — UFW restricts to docker bridge.
"""
import json
import socket
import sys
import threading
import time
from typing import Optional

from Xlib import display, X
from Xlib.ext.xtest import fake_input

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 7777
DISPLAY = ":99"

# Keysym values for CS 1.6 default binds. Lowercase letters match the
# physical key. Arrow keys use the X11 keysym constants.
import Xlib.XK as _XK
KEY_MAP = {
    "w": _XK.XK_w, "a": _XK.XK_a, "s": _XK.XK_s, "d": _XK.XK_d,
    "e": _XK.XK_e, "q": _XK.XK_q,
    "space": _XK.XK_space,
    "shift": _XK.XK_Shift_L,
    "ctrl":  _XK.XK_Control_L,
    "up":    _XK.XK_Up,    "down":  _XK.XK_Down,
    "left":  _XK.XK_Left,  "right": _XK.XK_Right,
    "tab":   _XK.XK_Tab,
}

# Mouse-to-arrow-key mapping. xash3d in headless mode doesn't grab
# the pointer, so absolute mouse motion is ignored by the engine.
# We translate "mm" deltas into bound arrow-key presses, which the
# engine receives via its key bind chain (+left / +right / +lookup
# / +lookdown). Granularity: each frame's accumulated delta gets
# binned into "turn left now", "turn right now", etc.
MOUSE_X_THRESHOLD = 2  # pixels of dx below this = no horizontal turn
MOUSE_Y_THRESHOLD = 2
MOUSE_KEY_HOLD_S = 0.05  # how long to hold an arrow key per batch

_DISPLAY: Optional[display.Display] = None
_KEYCODES: dict[str, int] = {}
_LOCK = threading.Lock()


def log(msg: str) -> None:
    sys.stderr.write(f"[input-server] {msg}\n")
    sys.stderr.flush()


def init_display() -> bool:
    global _DISPLAY, _KEYCODES
    try:
        _DISPLAY = display.Display(DISPLAY)
    except Exception as e:
        log(f"display open failed: {e}")
        return False
    for k, sym in KEY_MAP.items():
        kc = _DISPLAY.keysym_to_keycode(sym)
        if kc == 0:
            log(f"keysym {k} -> keycode 0 (not mapped on this keyboard layout)")
        _KEYCODES[k] = kc
    log(f"X display :99 opened, {len(_KEYCODES)} keysyms resolved")
    return True


def send_key(k: str, down: bool) -> None:
    if _DISPLAY is None:
        return
    kc = _KEYCODES.get(k, 0)
    if kc == 0:
        return
    with _LOCK:
        fake_input(_DISPLAY, X.KeyPress if down else X.KeyRelease, kc)
        _DISPLAY.sync()


def mouse_to_arrows(dx: int, dy: int) -> None:
    """Translate a one-frame mouse delta into discrete arrow key
    holds for camera yaw + pitch. CS reads Left/Right as
    +left/+right and Up/Down as +lookup/+lookdown when bound."""
    if _DISPLAY is None:
        return
    held: list[str] = []
    if dx >= MOUSE_X_THRESHOLD:
        held.append("right")
    elif dx <= -MOUSE_X_THRESHOLD:
        held.append("left")
    if dy >= MOUSE_Y_THRESHOLD:
        held.append("down")
    elif dy <= -MOUSE_Y_THRESHOLD:
        held.append("up")
    if not held:
        return
    for k in held:
        send_key(k, True)
    # Background-release after a short hold. Magnitude of dx/dy
    # controls hold length so a fast mouse swipe = longer arrow hold.
    mag = max(abs(dx), abs(dy))
    # 1 pixel of delta = 5 ms of arrow hold, capped at 200 ms so a
    # single huge delta can't lock us into a long uncontrolled turn.
    hold_s = min(0.2, mag * 0.005)
    if hold_s < MOUSE_KEY_HOLD_S:
        hold_s = MOUSE_KEY_HOLD_S
    def release():
        time.sleep(hold_s)
        for k in held:
            send_key(k, False)
    threading.Thread(target=release, daemon=True).start()


def send_click(button: int) -> None:
    if _DISPLAY is None:
        return
    with _LOCK:
        fake_input(_DISPLAY, X.ButtonPress, button)
        _DISPLAY.sync()
        fake_input(_DISPLAY, X.ButtonRelease, button)
        _DISPLAY.sync()


def handle_event(evt: dict) -> None:
    t = evt.get("t")
    if t in ("kd", "ku"):
        k = evt.get("k", "")
        if k in KEY_MAP:
            send_key(k, t == "kd")
    elif t == "mm":
        dx = int(evt.get("dx", 0))
        dy = int(evt.get("dy", 0))
        if dx != 0 or dy != 0:
            mouse_to_arrows(dx, dy)
    elif t == "click":
        send_click(int(evt.get("b", 1)))
    elif t == "ping":
        pass


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
    # Open the X display with a short retry loop — on service start we
    # may race with Xvfb spinning up.
    for i in range(20):
        if init_display():
            break
        log(f"display retry {i+1}/20")
        time.sleep(0.5)
    else:
        log("could not open X display, exiting")
        sys.exit(1)
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
