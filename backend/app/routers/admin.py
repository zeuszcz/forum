from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.models.role import Role, UserRole
from app.models.section import Section
from app.models.thread import Post, Thread
from app.models.user import User
from app.schemas.admin import (
    AdminStats,
    AdminUserRead,
    AdminUsersResponse,
    BanRequest,
    DeletePostRequest,
    ModerationLogRead,
    MuteRequest,
    ThreadCreationRequest,
    ThreadLockRequest,
)
from app.schemas.user import RoleRead
from app.services import admin as admin_service
from app.services import auth as auth_service


# -----------------------------------------------------------------------------
# Staff-only guard
# -----------------------------------------------------------------------------

async def require_staff(user: CurrentUser, db: DbSession) -> User:
    """Block requests from non-staff users with 403."""
    roles = await auth_service.get_user_roles(db, user.id)
    if not any(r.is_staff for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нужны права персонала",
        )
    return user


StaffUser = Annotated[User, Depends(require_staff)]

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_staff)])


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

async def _serialize_admin_user(db, user: User) -> AdminUserRead:
    roles = await auth_service.get_user_roles(db, user.id)
    return AdminUserRead(
        id=user.id,
        nickname=user.nickname,
        email=user.email,
        avatar_url=user.avatar_url,
        title=user.title,
        is_active=user.is_active,
        is_verified=user.is_verified,
        last_seen_at=user.last_seen_at,
        created_at=user.created_at,
        is_banned=user.is_banned,
        ban_reason=user.ban_reason,
        banned_until=user.banned_until,
        is_muted=user.is_muted,
        mute_reason=user.mute_reason,
        muted_until=user.muted_until,
        can_create_threads=user.can_create_threads,
        roles=[RoleRead.model_validate(r) for r in roles],
    )


# -----------------------------------------------------------------------------
# Stats
# -----------------------------------------------------------------------------

@router.get("/stats", response_model=AdminStats)
async def get_stats(db: DbSession) -> AdminStats:
    users_total = int((await db.execute(func.count().select().select_from(User))).scalar_one())
    users_banned = int(
        (
            await db.execute(
                func.count().select().select_from(select(User).where(User.is_banned.is_(True)).subquery())
            )
        ).scalar_one()
    )
    users_muted = int(
        (
            await db.execute(
                func.count().select().select_from(select(User).where(User.is_muted.is_(True)).subquery())
            )
        ).scalar_one()
    )
    threads_total = int((await db.execute(func.count().select().select_from(Thread))).scalar_one())
    posts_total = int((await db.execute(func.count().select().select_from(Post))).scalar_one())
    sections_locked = int(
        (
            await db.execute(
                func.count().select().select_from(select(Section).where(Section.is_locked.is_(True)).subquery())
            )
        ).scalar_one()
    )
    return AdminStats(
        users_total=users_total,
        users_banned=users_banned,
        users_muted=users_muted,
        threads_total=threads_total,
        posts_total=posts_total,
        sections_locked=sections_locked,
    )


# -----------------------------------------------------------------------------
# User management
# -----------------------------------------------------------------------------

@router.get("/users", response_model=AdminUsersResponse)
async def list_users(
    db: DbSession,
    q: str | None = Query(default=None),
    filter: Literal["all", "banned", "muted", "staff"] = "all",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AdminUsersResponse:
    users, total = await admin_service.list_users(
        db, q=q, filter=filter if filter != "all" else None, limit=limit, offset=offset
    )
    return AdminUsersResponse(
        users=[await _serialize_admin_user(db, u) for u in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/users/{user_id}/ban", response_model=AdminUserRead)
async def ban(user_id: int, payload: BanRequest, actor: StaffUser, db: DbSession) -> AdminUserRead:
    user = await admin_service.ban_user(
        db, actor=actor, target_id=user_id, reason=payload.reason, duration_hours=payload.duration_hours
    )
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/unban", response_model=AdminUserRead)
async def unban(user_id: int, actor: StaffUser, db: DbSession) -> AdminUserRead:
    user = await admin_service.unban_user(db, actor=actor, target_id=user_id)
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/mute", response_model=AdminUserRead)
async def mute(user_id: int, payload: MuteRequest, actor: StaffUser, db: DbSession) -> AdminUserRead:
    user = await admin_service.mute_user(
        db, actor=actor, target_id=user_id, reason=payload.reason, duration_hours=payload.duration_hours
    )
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/unmute", response_model=AdminUserRead)
async def unmute(user_id: int, actor: StaffUser, db: DbSession) -> AdminUserRead:
    user = await admin_service.unmute_user(db, actor=actor, target_id=user_id)
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/thread-creation", response_model=AdminUserRead)
async def set_thread_creation(
    user_id: int, payload: ThreadCreationRequest, actor: StaffUser, db: DbSession
) -> AdminUserRead:
    user = await admin_service.set_thread_creation(
        db, actor=actor, target_id=user_id, can_create=payload.can_create, reason=payload.reason
    )
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/role/{role_slug}", response_model=AdminUserRead)
async def grant_role(user_id: int, role_slug: str, actor: StaffUser, db: DbSession) -> AdminUserRead:
    user = await admin_service.get_user_or_404(db, user_id)
    role_q = await db.execute(select(Role).where(Role.slug == role_slug))
    role = role_q.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    existing = await db.execute(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
    )
    if existing.scalar_one_or_none() is None:
        from app.models.moderation import ModerationLog

        db.add(UserRole(user_id=user.id, role_id=role.id))
        db.add(
            ModerationLog(
                actor_id=actor.id,
                target_user_id=user.id,
                action="role_grant",
                reason=role_slug,
            )
        )
        await db.commit()
    return await _serialize_admin_user(db, user)


@router.delete("/users/{user_id}/role/{role_slug}", response_model=AdminUserRead)
async def revoke_role(user_id: int, role_slug: str, actor: StaffUser, db: DbSession) -> AdminUserRead:
    user = await admin_service.get_user_or_404(db, user_id)
    from app.models.moderation import ModerationLog

    role_q = await db.execute(select(Role).where(Role.slug == role_slug))
    role = role_q.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    ur_q = await db.execute(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
    )
    ur = ur_q.scalar_one_or_none()
    if ur is not None:
        await db.delete(ur)
        db.add(
            ModerationLog(
                actor_id=actor.id,
                target_user_id=user.id,
                action="role_revoke",
                reason=role_slug,
            )
        )
        await db.commit()
    return await _serialize_admin_user(db, user)


# -----------------------------------------------------------------------------
# Section management
# -----------------------------------------------------------------------------

@router.post("/sections/{slug}/lock")
async def lock_section(slug: str, payload: ThreadLockRequest, actor: StaffUser, db: DbSession) -> dict:
    section = await admin_service.lock_section(db, actor=actor, slug=slug, locked=payload.locked)
    return {"slug": section.slug, "is_locked": section.is_locked}


# -----------------------------------------------------------------------------
# Thread / post moderation
# -----------------------------------------------------------------------------

@router.post("/threads/{thread_id}/lock")
async def lock_thread(thread_id: int, payload: ThreadLockRequest, actor: StaffUser, db: DbSession) -> dict:
    thread = await admin_service.lock_thread(db, actor=actor, thread_id=thread_id, locked=payload.locked)
    return {"id": thread.id, "is_locked": thread.is_locked}


@router.post("/posts/{post_id}/delete")
async def delete_post(
    post_id: int, payload: DeletePostRequest, actor: StaffUser, db: DbSession
) -> dict:
    post = await admin_service.delete_post(db, actor=actor, post_id=post_id, reason=payload.reason)
    return {"id": post.id, "is_deleted": post.is_deleted}


# -----------------------------------------------------------------------------
# Audit log
# -----------------------------------------------------------------------------

@router.get("/audit", response_model=list[ModerationLogRead])
async def list_audit(
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[ModerationLogRead]:
    rows = await admin_service.list_audit(db, limit=limit, offset=offset)
    return [ModerationLogRead.model_validate(r) for r in rows]
