from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    Header,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import (
    COOKIE_NAME,
    CurrentUser,
    DbSession,
    OptionalUser,
    get_current_user,
)
from app.core.security import decode_token
from app.models.shoutbox import ShoutboxMessage
from app.models.user import User
from app.schemas.shoutbox import (
    ChatMuteCreate,
    ChatMuteRead,
    MapVoteCreate,
    ReactionToggleResult,
    ServerStatus,
    ShoutboxCreate,
    ShoutboxRead,
    ShoutboxReplyPreview,
    ShoutboxUpdate,
    SystemMessageCreate,
    VoteRequest,
)
from app.schemas.user import RoleRead, UserPublic
from app.services import auth as auth_service
from app.services import cs_server as cs_server_service
from app.services import shoutbox as shoutbox_service

router = APIRouter(prefix="/shoutbox", tags=["shoutbox"])

_FLOOD_WINDOW = timedelta(seconds=3)
_REPLY_PREVIEW_MAX = 180


# ---------------------------------------------------------------------------
# Broadcasting (in-process). Single uvicorn worker handles WS fanout. Scaling
# beyond one worker needs Redis pub/sub.
# ---------------------------------------------------------------------------


class _Broadcaster:
    def __init__(self) -> None:
        self._sockets: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._sockets.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._sockets.discard(ws)

    async def broadcast(self, event: dict[str, Any]) -> None:
        payload = json.dumps(event, default=str)
        async with self._lock:
            sockets = list(self._sockets)
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._sockets.discard(ws)


BROADCASTER = _Broadcaster()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _user_to_public(db: AsyncSession, user: User | None) -> UserPublic | None:
    if user is None:
        return None
    roles = await auth_service.get_user_roles(db, user.id)
    return UserPublic(
        id=user.id,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        title=user.title,
        bio=user.bio,
        is_active=user.is_active,
        last_seen_at=user.last_seen_at,
        created_at=user.created_at,
        roles=[RoleRead.model_validate(r) for r in roles],
        total_posts=user.total_posts,
        total_reactions_received=user.total_reactions_received,
        thanks_received=user.thanks_received,
        granted_perks=list(user.granted_perks or []),
        birthday=user.birthday.isoformat() if user.birthday else None,
        steam_id=user.steam_id,
        bonus_xp=user.bonus_xp,
        case_keys=user.case_keys,
        nick_color=user.nick_color,
        avatar_glow_color=user.avatar_glow_color,
    )


def _truncate(s: str, limit: int = _REPLY_PREVIEW_MAX) -> str:
    if len(s) <= limit:
        return s
    return s[:limit].rstrip() + "…"


async def _resolve_reply_previews(
    db: AsyncSession,
    reply_ids: set[int],
) -> dict[int, ShoutboxReplyPreview]:
    if not reply_ids:
        return {}
    rows = await db.execute(
        select(ShoutboxMessage).where(ShoutboxMessage.id.in_(list(reply_ids)))
    )
    parents = list(rows.scalars().all())
    author_ids = {p.author_id for p in parents if p.author_id is not None}
    nicks: dict[int, str] = {}
    if author_ids:
        nres = await db.execute(
            select(User.id, User.nickname).where(User.id.in_(list(author_ids)))
        )
        nicks = {uid: nick for uid, nick in nres.all()}
    out: dict[int, ShoutboxReplyPreview] = {}
    for p in parents:
        out[p.id] = ShoutboxReplyPreview(
            id=p.id,
            body=_truncate(p.body) if not p.is_deleted else "[удалено]",
            author_nickname=nicks.get(p.author_id) if p.author_id else None,
            is_deleted=p.is_deleted,
        )
    return out


async def _messages_to_read(
    db: AsyncSession,
    rows: list[ShoutboxMessage],
    *,
    actor_id: int | None,
) -> list[ShoutboxRead]:
    user_ids = {m.author_id for m in rows if m.author_id is not None}
    users: dict[int, User] = {}
    if user_ids:
        ures = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u for u in ures.scalars().all()}

    reply_previews = await _resolve_reply_previews(
        db, {m.reply_to_id for m in rows if m.reply_to_id is not None}
    )

    msg_ids = [m.id for m in rows]
    counts_map = await shoutbox_service.reactions_for_messages(db, msg_ids)
    reacted_map: dict[int, list[str]] = {}
    if actor_id is not None:
        reacted_map = await shoutbox_service.reacted_kinds_for_user(
            db, msg_ids, actor_id
        )

    poll_ids = [m.id for m in rows if m.kind == "mapvote"]
    vote_counts_map = await shoutbox_service.vote_counts_for_messages(db, poll_ids)
    my_votes_map: dict[int, int] = {}
    if actor_id is not None and poll_ids:
        my_votes_map = await shoutbox_service.my_votes_for_messages(
            db, poll_ids, actor_id
        )

    out: list[ShoutboxRead] = []
    for m in rows:
        author = users.get(m.author_id) if m.author_id else None
        out.append(
            ShoutboxRead(
                id=m.id,
                body=m.body,
                created_at=m.created_at,
                edited_at=m.edited_at,
                is_pinned=m.is_pinned,
                is_deleted=m.is_deleted,
                kind=m.kind,
                meta=m.meta,
                author=await _user_to_public(db, author) if author else None,
                reply_to=reply_previews.get(m.reply_to_id) if m.reply_to_id else None,
                reactions=counts_map.get(m.id, {}),
                reacted=reacted_map.get(m.id, []),
                vote_counts=vote_counts_map.get(m.id, {}),
                my_vote=my_votes_map.get(m.id),
            )
        )
    return out


async def _message_to_read(
    db: AsyncSession,
    msg: ShoutboxMessage,
    *,
    actor_id: int | None,
) -> ShoutboxRead:
    rows = await _messages_to_read(db, [msg], actor_id=actor_id)
    return rows[0]


async def _is_chat_mod(db: AsyncSession, user: User) -> bool:
    roles = await auth_service.get_user_roles(db, user.id)
    return any(getattr(r, "is_staff", False) for r in roles)


# ---------------------------------------------------------------------------
# GET endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=list[ShoutboxRead])
async def list_messages(
    db: DbSession,
    actor: OptionalUser,
    limit: int = Query(default=50, ge=1, le=100),
    before_id: int | None = Query(default=None),
) -> list[ShoutboxRead]:
    rows = await shoutbox_service.list_recent(db, limit=limit, before_id=before_id)
    return await _messages_to_read(db, rows, actor_id=actor.id if actor else None)


@router.get("/pinned", response_model=list[ShoutboxRead])
async def list_pinned(db: DbSession, actor: OptionalUser) -> list[ShoutboxRead]:
    rows = await shoutbox_service.list_pinned(db)
    return await _messages_to_read(db, rows, actor_id=actor.id if actor else None)


# ---------------------------------------------------------------------------
# Mutation endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=ShoutboxRead, status_code=status.HTTP_201_CREATED)
async def post_message(
    payload: ShoutboxCreate, user: CurrentUser, db: DbSession
) -> ShoutboxRead:
    last_q = await db.execute(
        select(ShoutboxMessage)
        .where(ShoutboxMessage.author_id == user.id)
        .where(ShoutboxMessage.is_deleted.is_(False))
        .order_by(desc(ShoutboxMessage.created_at))
        .limit(1)
    )
    last = last_q.scalar_one_or_none()
    if last is not None and datetime.now(UTC) - last.created_at < _FLOOD_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком быстро. Подожди пару секунд.",
        )

    msg = await shoutbox_service.post(db, author=user, payload=payload)
    read = await _message_to_read(db, msg, actor_id=user.id)
    await BROADCASTER.broadcast(
        {"type": "new", "message": read.model_dump(mode="json")}
    )
    return read


@router.patch("/{message_id}", response_model=ShoutboxRead)
async def edit_message(
    message_id: int,
    payload: ShoutboxUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ShoutboxRead:
    msg = await shoutbox_service.get_message(db, message_id)
    is_mod = await _is_chat_mod(db, user)
    updated = await shoutbox_service.update_message(
        db, message=msg, actor=user, payload=payload, bypass_window=is_mod
    )
    read = await _message_to_read(db, updated, actor_id=user.id)
    await BROADCASTER.broadcast(
        {"type": "edit", "message": read.model_dump(mode="json")}
    )
    return read


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: int, user: CurrentUser, db: DbSession
) -> None:
    msg = await shoutbox_service.get_message(db, message_id)
    is_mod = await _is_chat_mod(db, user)
    await shoutbox_service.soft_delete(db, message=msg, actor=user, is_staff=is_mod)
    await BROADCASTER.broadcast({"type": "delete", "id": message_id})


@router.post("/{message_id}/pin", response_model=ShoutboxRead)
async def pin_message(
    message_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> ShoutboxRead:
    if not await _is_chat_mod(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    msg = await shoutbox_service.get_message(db, message_id)
    pinned, unpinned_ids = await shoutbox_service.set_pinned(
        db, message=msg, pinned=True
    )
    read = await _message_to_read(db, pinned, actor_id=user.id)
    await BROADCASTER.broadcast(
        {
            "type": "pin",
            "message": read.model_dump(mode="json"),
            "unpinned": unpinned_ids,
        }
    )
    return read


@router.delete("/{message_id}/pin", response_model=ShoutboxRead)
async def unpin_message(
    message_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> ShoutboxRead:
    if not await _is_chat_mod(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    msg = await shoutbox_service.get_message(db, message_id)
    unpinned, _ = await shoutbox_service.set_pinned(db, message=msg, pinned=False)
    read = await _message_to_read(db, unpinned, actor_id=user.id)
    await BROADCASTER.broadcast(
        {"type": "unpin", "id": message_id, "message": read.model_dump(mode="json")}
    )
    return read


# ---------------------------------------------------------------------------
# Reactions
# ---------------------------------------------------------------------------


@router.post("/{message_id}/react", response_model=ReactionToggleResult)
async def react_message(
    message_id: int,
    user: CurrentUser,
    db: DbSession,
    kind: str = Query(...),
) -> ReactionToggleResult:
    counts = await shoutbox_service.toggle_reaction(
        db, message_id=message_id, user_id=user.id, kind=kind
    )
    reacted_map = await shoutbox_service.reacted_kinds_for_user(
        db, [message_id], user.id
    )
    reacted = reacted_map.get(message_id, [])
    await BROADCASTER.broadcast(
        {"type": "react", "id": message_id, "reactions": counts}
    )
    return ReactionToggleResult(id=message_id, reactions=counts, reacted=reacted)


# ---------------------------------------------------------------------------
# Map vote
# ---------------------------------------------------------------------------


@router.post(
    "/mapvote", response_model=ShoutboxRead, status_code=status.HTTP_201_CREATED
)
async def create_mapvote(
    payload: MapVoteCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> ShoutboxRead:
    if not await _is_chat_mod(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    msg = await shoutbox_service.post_mapvote(db, author=user, payload=payload)
    read = await _message_to_read(db, msg, actor_id=user.id)
    await BROADCASTER.broadcast(
        {"type": "new", "message": read.model_dump(mode="json")}
    )
    return read


@router.post("/{message_id}/vote")
async def vote_message(
    message_id: int,
    payload: VoteRequest,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    counts = await shoutbox_service.cast_vote(
        db,
        message_id=message_id,
        user_id=user.id,
        option_idx=payload.option_idx,
    )
    await BROADCASTER.broadcast(
        {
            "type": "vote",
            "id": message_id,
            # JSON object keys must be strings; clients convert back to int.
            "vote_counts": {str(k): v for k, v in counts.items()},
        }
    )
    return {
        "id": message_id,
        "vote_counts": counts,
        "my_vote": payload.option_idx,
    }


# ---------------------------------------------------------------------------
# System bot-cast (HMAC token, no user auth)
# ---------------------------------------------------------------------------


@router.post(
    "/system", response_model=ShoutboxRead, status_code=status.HTTP_201_CREATED
)
async def post_system_message(
    payload: SystemMessageCreate,
    db: DbSession,
    x_shoutbox_token: Annotated[str | None, Header(alias="X-Shoutbox-Token")] = None,
) -> ShoutboxRead:
    expected = settings.shoutbox_system_token
    if not expected:
        # Endpoint disabled until an env token is configured.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="System bot-cast disabled (set SHOUTBOX_SYSTEM_TOKEN)",
        )
    if not x_shoutbox_token or x_shoutbox_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad system token"
        )
    msg = await shoutbox_service.post_system(
        db, body=payload.body, tag=payload.tag, category=payload.category
    )
    read = await _message_to_read(db, msg, actor_id=None)
    await BROADCASTER.broadcast(
        {"type": "new", "message": read.model_dump(mode="json")}
    )
    return read


# ---------------------------------------------------------------------------
# CS server status snapshot (5s cached)
# ---------------------------------------------------------------------------


@router.get("/server-status", response_model=ServerStatus)
async def server_status() -> ServerStatus:
    data = await cs_server_service.get_server_status()
    return ServerStatus(**data)


# ---------------------------------------------------------------------------
# Bulk clear (mod-only)
# ---------------------------------------------------------------------------


@router.post("/clear", status_code=status.HTTP_200_OK)
async def clear_chat(
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
    limit: int = Query(default=200, ge=1, le=200),
) -> dict[str, Any]:
    if not await _is_chat_mod(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    deleted_ids = await shoutbox_service.clear_recent(db, limit=limit)
    for mid in deleted_ids:
        await BROADCASTER.broadcast({"type": "delete", "id": mid})
    return {"deleted": len(deleted_ids), "ids": deleted_ids}


# ---------------------------------------------------------------------------
# Chat mutes (staff only)
# ---------------------------------------------------------------------------


@router.post("/mute", response_model=ChatMuteRead, status_code=status.HTTP_201_CREATED)
async def mute_user_endpoint(
    payload: ChatMuteCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> ChatMuteRead:
    if not await _is_chat_mod(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    target = await db.get(User, payload.user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден"
        )
    row = await shoutbox_service.mute_user(
        db,
        target_user_id=payload.user_id,
        duration_min=payload.duration_min,
        reason=payload.reason,
        actor_id=user.id,
    )
    return ChatMuteRead.model_validate(row)


@router.delete("/mute/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unmute_user_endpoint(
    target_user_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> None:
    if not await _is_chat_mod(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Только для модераторов"
        )
    await shoutbox_service.unmute_user(db, target_user_id=target_user_id)


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


@router.websocket("/ws")
async def shoutbox_ws(
    ws: WebSocket,
    db: Annotated[AsyncSession, Depends(get_db)],
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
    await ws.accept()
    await BROADCASTER.connect(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "user_id": user_id}))
        while True:
            _ = await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await BROADCASTER.disconnect(ws)
