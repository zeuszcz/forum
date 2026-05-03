from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import desc, func, select, update

from app.core.deps import CurrentUser, DbSession
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(20, ge=1, le=50),
    only_unread: bool = Query(False),
) -> dict:
    q = select(Notification).where(Notification.user_id == user.id)
    if only_unread:
        q = q.where(Notification.read.is_(False))
    rows = await db.execute(q.order_by(desc(Notification.created_at)).limit(limit))
    items = list(rows.scalars().all())

    cnt = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
    )
    return {
        "items": [
            {
                "id": n.id,
                "kind": n.kind,
                "title": n.title,
                "body": n.body,
                "href": n.href,
                "read": n.read,
                "created_at": n.created_at.isoformat(),
            }
            for n in items
        ],
        "unread": int(cnt.scalar_one()),
    }


@router.post("/read-all")
async def mark_all_read(user: CurrentUser, db: DbSession) -> dict:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
        .values(read=True)
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/{nid}/read")
async def mark_one_read(nid: int, user: CurrentUser, db: DbSession) -> dict:
    res = await db.execute(
        select(Notification).where(Notification.id == nid, Notification.user_id == user.id)
    )
    n = res.scalar_one_or_none()
    if n is None:
        raise HTTPException(status_code=404, detail="not found")
    n.read = True
    await db.commit()
    return {"status": "ok", "id": nid}
