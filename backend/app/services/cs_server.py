"""Best-effort A2S_INFO query for the CS 1.6 jail server.

Pure stdlib (socket + struct). Wraps the blocking socket call in
asyncio.to_thread so it doesn't block the event loop. Result is cached in
process for 5 s so a busy chat doesn't hammer the game server.

Handles the post-2020 challenge protocol: if the first reply is a 5-byte
challenge packet (header 'A'), we resend the query with the challenge bytes
appended and read the real reply.

When the server is offline / unreachable / not speaking A2S, returns a
disabled status dict so callers can still render the advertised address.
"""
from __future__ import annotations

import asyncio
import socket
import struct
import time
from typing import Any

from app.core.config import settings

_REQ = b"\xff\xff\xff\xffTSource Engine Query\x00"

_CACHE_TTL_S = 5.0
_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _read_cstring(buf: bytes, pos: int) -> tuple[str, int]:
    end = buf.find(b"\x00", pos)
    if end < 0:
        return buf[pos:].decode("utf-8", errors="replace"), len(buf)
    return buf[pos:end].decode("utf-8", errors="replace"), end + 1


def _parse_info(data: bytes) -> dict[str, Any] | None:
    """Parse an A2S_INFO response. Supports both modern (header 'I', 0x49) and
    legacy GoldSrc (header 'm', 0x6D) variants."""
    if len(data) < 5 or data[:4] != b"\xff\xff\xff\xff":
        return None
    header = data[4:5]
    pos = 5

    if header == b"I":
        # Modern format
        if pos >= len(data):
            return None
        # protocol byte
        pos += 1
        name, pos = _read_cstring(data, pos)
        map_name, pos = _read_cstring(data, pos)
        _folder, pos = _read_cstring(data, pos)
        _game, pos = _read_cstring(data, pos)
        if pos + 5 > len(data):
            return None
        _appid = struct.unpack_from("<H", data, pos)[0]
        pos += 2
        players = data[pos]
        max_players = data[pos + 1]
        return {
            "name": name,
            "map": map_name,
            "players": int(players),
            "max_players": int(max_players),
            "online": True,
        }

    if header == b"m":
        # Legacy GoldSrc format: server_address cstring first
        _addr, pos = _read_cstring(data, pos)
        name, pos = _read_cstring(data, pos)
        map_name, pos = _read_cstring(data, pos)
        _folder, pos = _read_cstring(data, pos)
        _game, pos = _read_cstring(data, pos)
        if pos + 2 > len(data):
            return None
        players = data[pos]
        max_players = data[pos + 1]
        return {
            "name": name,
            "map": map_name,
            "players": int(players),
            "max_players": int(max_players),
            "online": True,
        }

    return None


def _blocking_query(host: str, port: int, timeout: float) -> dict[str, Any] | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        start = time.monotonic()
        sock.sendto(_REQ, (host, port))
        data, _ = sock.recvfrom(4096)
        # Challenge dance — post-2020 Valve required it for A2S_INFO.
        if len(data) >= 9 and data[:5] == b"\xff\xff\xff\xffA":
            challenge = data[5:9]
            sock.sendto(_REQ + challenge, (host, port))
            data, _ = sock.recvfrom(4096)
        ping_ms = int((time.monotonic() - start) * 1000)
        parsed = _parse_info(data)
        if parsed is not None:
            parsed["ping_ms"] = ping_ms
        return parsed
    except (socket.timeout, OSError):
        return None
    finally:
        sock.close()


async def query_a2s(address: str, timeout: float = 2.0) -> dict[str, Any] | None:
    """address is host:port. Returns parsed info dict or None on failure."""
    if ":" not in address:
        return None
    host, _, port_s = address.rpartition(":")
    try:
        port = int(port_s)
    except ValueError:
        return None
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_blocking_query, host, port, timeout),
            timeout=timeout + 0.5,
        )
    except (TimeoutError, asyncio.TimeoutError):
        return None


async def get_server_status(force_refresh: bool = False) -> dict[str, Any]:
    """Returns a dict suitable for the ServerStatus schema. Always shape-
    complete: when the server is unreachable we still echo the advertised
    address + configured name so the UI can render an `offline` indicator."""
    address = settings.cs_server_address
    cache_key = address
    now = time.monotonic()
    if not force_refresh:
        cached = _cache.get(cache_key)
        if cached and now - cached[0] < _CACHE_TTL_S:
            return cached[1]

    base = {
        "address": address,
        "name": settings.cs_server_name,
        "map": None,
        "players": 0,
        "max_players": 32,
        "online": False,
        "ping_ms": None,
        "score_ct": None,
        "score_t": None,
    }
    info = await query_a2s(address)
    if info is not None:
        base.update(
            {
                "name": info.get("name") or base["name"],
                "map": info.get("map"),
                "players": info.get("players", 0),
                "max_players": info.get("max_players", 32),
                "online": True,
                "ping_ms": info.get("ping_ms"),
            }
        )
    _cache[cache_key] = (now, base)
    return base
