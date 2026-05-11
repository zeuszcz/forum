"""Minimal GoldSrc/CS 1.6 RCON probe.

Used once (and committed for future reproducibility) to enumerate the
jbf_uaio_* admin-menu commands and capture their usage strings — the
plugin prints "Usage: <cmd> <args>" whenever the command is invoked
without parameters.

CS 1.6 RCON protocol:
 1) send: \\xff\\xff\\xff\\xffchallenge rcon\\n
 2) recv: \\xff\\xff\\xff\\xffchallenge rcon <num>
 3) send: \\xff\\xff\\xff\\xffrcon <num> "<pass>" <command>\\n
 4) recv: \\xff\\xff\\xff\\xffl<response text>

Server has sv_rcon_minfailures=1 / sv_rcon_banpenalty=9999999 so a single
wrong password triggers a ~9M-second ban. Password is sourced from the
env file written to /opt/cs-log-poller/poller.env (or override via env).
"""
from __future__ import annotations

import os
import re
import socket
import sys
import time

HOST = os.environ.get("CS_HOST", "37.230.228.248")
PORT = int(os.environ.get("CS_PORT", "27015"))
PASS = os.environ.get("CS_RCON_PASS", "")
HEAD = b"\xff\xff\xff\xff"


def rcon(sock: socket.socket, command: str, *, timeout: float = 2.0) -> str:
    sock.sendto(HEAD + b"challenge rcon\n", (HOST, PORT))
    data, _ = sock.recvfrom(4096)
    m = re.search(rb"challenge rcon (-?\d+)", data)
    if not m:
        raise RuntimeError(f"no challenge in {data!r}")
    challenge = m.group(1).decode()
    payload = HEAD + f'rcon {challenge} "{PASS}" {command}\n'.encode("utf-8")
    sock.sendto(payload, (HOST, PORT))
    chunks: list[bytes] = []
    sock.settimeout(timeout)
    try:
        while True:
            data, _ = sock.recvfrom(8192)
            chunks.append(data)
    except (socket.timeout, TimeoutError):
        pass
    out = b"".join(chunks)
    # Strip 4-byte FFFFFFFF magic + leading 'l' (ord 0x6c) marker.
    if out.startswith(HEAD):
        out = out[len(HEAD):]
    if out.startswith(b"l"):
        out = out[1:]
    return out.decode("utf-8", errors="replace").strip("\x00 \n\r")


def main() -> int:
    if not PASS:
        print("CS_RCON_PASS empty — refusing to bruteforce", file=sys.stderr)
        return 2

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(3)

    if len(sys.argv) > 1 and sys.argv[1] == "single":
        cmd = " ".join(sys.argv[2:])
        print(rcon(s, cmd, timeout=3))
        return 0

    cmds = sys.argv[1:] or ["status"]
    for cmd in cmds:
        print(f"=== {cmd} ===")
        try:
            print(rcon(s, cmd))
        except Exception as e:  # noqa: BLE001
            print(f"  ERR: {e}")
        time.sleep(0.25)
    return 0


if __name__ == "__main__":
    sys.exit(main())
