"""Async wrapper around the CS 1.6 (GoldSrc) RCON protocol.

The protocol is UDP-based:
  1. Client sends `\\xff\\xff\\xff\\xffchallenge rcon\\n`
  2. Server replies `\\xff\\xff\\xff\\xffchallenge rcon <num>`
  3. Client sends `\\xff\\xff\\xff\\xffrcon <num> "<password>" <command>\\n`
  4. Server replies with `\\xff\\xff\\xff\\xffl<text>` — possibly across
     multiple UDP datagrams for long responses.

Implemented with stdlib socket + asyncio.to_thread to avoid pulling in a
DatagramProtocol just for ~50 lines of blocking code. The CS server we
talk to is on a local LAN-like hop (~5 ms), so timeouts are generous.
"""
from __future__ import annotations

import asyncio
import re
import socket
import time
from dataclasses import dataclass

from app.core.config import settings

_HEAD = b"\xff\xff\xff\xff"
_RE_CHALLENGE = re.compile(rb"challenge rcon (-?\d+)")


class RconError(Exception):
    """Anything that prevents us from returning a clean response to the user."""


@dataclass
class RconResult:
    """Plugin output + measured latency. `output` is whatever the server
    printed to its console while handling the command — empty for fire-and-
    forget actions like `jbf_uaio_kill` that only print to the target's
    chat (not the server console)."""

    output: str
    latency_ms: int


def _blocking_rcon(
    host: str,
    port: int,
    password: str,
    command: str,
    timeout: float,
) -> RconResult:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    started = time.monotonic()
    try:
        # 1) Challenge.
        sock.sendto(_HEAD + b"challenge rcon\n", (host, port))
        data, _ = sock.recvfrom(4096)
        m = _RE_CHALLENGE.search(data)
        if not m:
            raise RconError(f"no challenge in {data[:80]!r}")
        challenge = m.group(1).decode("ascii")

        # 2) Command.
        payload = (
            _HEAD
            + f'rcon {challenge} "{password}" {command}\n'.encode("utf-8")
        )
        sock.sendto(payload, (host, port))

        # 3) Drain responses until idle. Some commands print nothing (short
        #    actions); others span multiple datagrams.
        chunks: list[bytes] = []
        sock.settimeout(0.8)
        try:
            while True:
                data, _ = sock.recvfrom(8192)
                chunks.append(data)
        except socket.timeout:
            pass

        out = b"".join(chunks)
        # Strip the magic + 'l' marker from the FIRST packet only — subsequent
        # packets are continuation chunks without their own header.
        if out.startswith(_HEAD):
            out = out[len(_HEAD):]
        if out.startswith(b"l"):
            out = out[1:]
        text = out.decode("utf-8", errors="replace").strip("\x00 \n\r")
        # Detect auth failures explicitly so the caller can show a clear
        # message instead of "(empty response)".
        if text.lower().startswith("bad rcon_password"):
            raise RconError("bad rcon_password")
        if text.lower().startswith("rcon: nothing"):
            raise RconError("unknown command")

        latency = int((time.monotonic() - started) * 1000)
        return RconResult(output=text, latency_ms=latency)
    finally:
        sock.close()


async def execute(command: str, *, timeout: float = 3.0) -> RconResult:
    """Run a single RCON command against the configured CS server.
    Raises RconError if the server isn't configured, doesn't respond, or
    returns an auth failure."""
    if not settings.cs_rcon_password:
        raise RconError("cs_rcon_password unset on the forum (server-side)")
    address = settings.cs_server_address
    if ":" not in address:
        raise RconError(f"bad cs_server_address: {address!r}")
    host, _, port_s = address.rpartition(":")
    try:
        port = int(port_s)
    except ValueError as e:
        raise RconError(f"bad port in cs_server_address: {address!r}") from e

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                _blocking_rcon,
                host,
                port,
                settings.cs_rcon_password,
                command,
                timeout,
            ),
            timeout=timeout + 1.0,
        )
    except (TimeoutError, asyncio.TimeoutError) as e:
        raise RconError("server did not respond in time") from e
    except RconError:
        raise
    except OSError as e:
        raise RconError(f"network error: {e}") from e


__all__ = ["RconError", "RconResult", "execute"]
