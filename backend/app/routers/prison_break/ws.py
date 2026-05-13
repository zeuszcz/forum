"""prison_break — WebSocket broadcaster + chat endpoints.

Topology:
  - One global WS endpoint per event: /api/event/prison-break/ws
  - Server pushes events filtered by audience:
      * global   — all participants
      * faction  — only same-faction subscribers
      * cell     — only cellmates of the actor
      * private  — only actor + explicit target
  - Cell chat messages are a special event_log kind="cell_chat".

Wire format (server → client):
  {"t": "event", "kind": "tunnel_progress", "payload": {...}, "ts": ISO}
  {"t": "event", "kind": "cell_chat", "payload": {...}}
  {"t": "ping"}                  # keepalive

Wire format (client → server):
  {"t": "chat", "cell_id": 5, "body": "..."}
  {"t": "pong"}
"""
from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.deps import COOKIE_NAME
from app.core.security import decode_token
from app.models.prison_break import PrisonBreakPlayer
from app.models.prison_break.extras import (
    PrisonBreakCellMessage,
    PrisonBreakEventLog,
)
from app.services.prison_break import event_service


ws_router = APIRouter(prefix="/api/event/prison-break", tags=["prison_break_ws"])


# ---------------------------------------------------------------------------
# Broadcaster — in-process pub/sub. For multi-instance setups swap to Redis.
# ---------------------------------------------------------------------------


class _Connection:
    __slots__ = ("ws", "player_id", "event_id", "faction", "cell_id", "role")

    def __init__(
        self,
        ws: WebSocket,
        player_id: int,
        event_id: int,
        faction: str | None,
        cell_id: int | None,
        role: str | None,
    ) -> None:
        self.ws = ws
        self.player_id = player_id
        self.event_id = event_id
        self.faction = faction
        self.cell_id = cell_id
        self.role = role


class PrisonBreakBroadcaster:
    """In-memory connection set with audience-aware fan-out."""

    def __init__(self) -> None:
        self._connections: set[_Connection] = set()
        self._lock = asyncio.Lock()

    async def connect(self, conn: _Connection) -> None:
        async with self._lock:
            self._connections.add(conn)

    async def disconnect(self, conn: _Connection) -> None:
        async with self._lock:
            self._connections.discard(conn)

    async def broadcast(
        self,
        event_id: int,
        kind: str,
        payload: dict[str, Any],
        *,
        visibility: str = "public",
        actor_id: int | None = None,
        target_id: int | None = None,
        cell_id: int | None = None,
        faction: str | None = None,
    ) -> None:
        """Fan-out by visibility."""
        msg = json.dumps({
            "t": "event",
            "kind": kind,
            "payload": payload,
            "ts": datetime.now(UTC).isoformat(),
        })
        dead: list[_Connection] = []
        async with self._lock:
            recipients = list(self._connections)
        for c in recipients:
            if c.event_id != event_id:
                continue
            if visibility == "public":
                pass
            elif visibility == "faction":
                if c.faction != faction and c.player_id != actor_id:
                    continue
            elif visibility == "cell":
                if c.cell_id != cell_id and c.player_id != actor_id:
                    continue
            elif visibility == "private":
                if c.player_id not in (actor_id, target_id):
                    continue
            else:
                continue
            try:
                await c.ws.send_text(msg)
            except Exception:
                dead.append(c)
        for c in dead:
            await self.disconnect(c)


BROADCASTER = PrisonBreakBroadcaster()


# ---------------------------------------------------------------------------
# WS endpoint
# ---------------------------------------------------------------------------


@ws_router.websocket("/ws")
async def event_ws(
    ws: WebSocket,
    session_cookie: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
    token_qs: Annotated[str | None, Query(alias="token")] = None,
) -> None:
    user_id: int | None = None
    token = session_cookie or token_qs
    if token:
        payload = decode_token(token)
        if payload and payload.get("type") in {"access", "refresh"}:
            try:
                user_id = int(payload.get("sub") or 0) or None
            except (TypeError, ValueError):
                user_id = None
    if user_id is None:
        await ws.close(code=4401, reason="unauthenticated")
        return

    # Resolve player record. WS is per-active-event.
    async with SessionLocal() as db:
        event = await event_service.find_current_event(db)
        if event is None or event.status != "active":
            await ws.close(code=4404, reason="no active event")
            return
        rows = await db.execute(
            select(PrisonBreakPlayer).where(
                PrisonBreakPlayer.event_id == event.id,
                PrisonBreakPlayer.user_id == user_id,
            )
        )
        player = rows.scalar_one_or_none()
        if player is None:
            await ws.close(code=4403, reason="not in event")
            return
        conn_event_id = event.id
        conn_data = {
            "player_id": player.id,
            "event_id": event.id,
            "faction": player.faction,
            "cell_id": player.cell_id,
            "role": player.role,
        }

    conn = _Connection(ws=ws, **conn_data)
    await ws.accept()
    await BROADCASTER.connect(conn)
    await ws.send_text(json.dumps({"t": "hello", "player_id": conn.player_id}))

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=45.0)
            except asyncio.TimeoutError:
                await ws.send_text(json.dumps({"t": "ping"}))
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            t = msg.get("t")
            if t == "pong":
                continue
            if t == "chat":
                cell_id = msg.get("cell_id")
                body = (msg.get("body") or "").strip()
                if not body or len(body) > 500 or cell_id != conn.cell_id:
                    continue
                async with SessionLocal() as db:
                    row = PrisonBreakCellMessage(
                        event_id=conn_event_id,
                        cell_id=cell_id,
                        author_id=conn.player_id,
                        body=body,
                    )
                    db.add(row)
                    await db.commit()
                    await db.refresh(row)
                    msg_id = row.id
                    created_at = row.created_at.isoformat()
                await BROADCASTER.broadcast(
                    conn_event_id,
                    "cell_chat",
                    {
                        "id": msg_id,
                        "cell_id": cell_id,
                        "author_id": conn.player_id,
                        "body": body,
                        "created_at": created_at,
                    },
                    visibility="cell",
                    cell_id=cell_id,
                    actor_id=conn.player_id,
                )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await BROADCASTER.disconnect(conn)


# ---------------------------------------------------------------------------
# Helper for non-WS code to push an event-log row + broadcast.
# ---------------------------------------------------------------------------


async def emit_event_log(
    db,
    *,
    event_id: int,
    kind: str,
    visibility: str = "public",
    actor_id: int | None = None,
    target_id: int | None = None,
    payload: dict[str, Any] | None = None,
    cell_id: int | None = None,
    faction: str | None = None,
) -> None:
    payload = payload or {}
    db.add(PrisonBreakEventLog(
        event_id=event_id,
        kind=kind,
        visibility=visibility,
        actor_id=actor_id,
        target_id=target_id,
        payload=payload,
    ))
    # Defer broadcast until after caller commits — best-effort.
    asyncio.create_task(BROADCASTER.broadcast(
        event_id, kind, payload,
        visibility=visibility,
        actor_id=actor_id,
        target_id=target_id,
        cell_id=cell_id,
        faction=faction,
    ))
