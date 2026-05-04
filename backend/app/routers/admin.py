from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, require_permission
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
    KeysGrantRequest,
    ModerationLogRead,
    MuteRequest,
    PerksUpdate,
    RoleAdminRead,
    RoleCreate,
    RoleUpdate,
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

# Per-permission deps — used to gate individual actions
BanActor = Annotated[User, Depends(require_permission("can_ban"))]
MuteActor = Annotated[User, Depends(require_permission("can_mute"))]
ThreadActor = Annotated[User, Depends(require_permission("can_manage_threads"))]
UsersActor = Annotated[User, Depends(require_permission("can_manage_users"))]
RolesActor = Annotated[User, Depends(require_permission("can_manage_roles"))]
PerksActor = Annotated[User, Depends(require_permission("can_grant_perks"))]
AuditActor = Annotated[User, Depends(require_permission("can_view_audit"))]

# Whitelist of perks that can be granted manually (mirrors lib/rank.ts).
# embed_images / create_polls / vote_polls used to be here but are now
# baseline for everyone — granting them is a no-op so we drop them.
ALLOWED_PERKS = {"custom_title", "glow_nick", "animated_frame"}

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_staff)])


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

async def _user_permissions(db, user: User) -> dict[str, bool]:
    """Aggregate per-permission booleans for this user (OR across their roles)."""
    roles = await auth_service.get_user_roles(db, user.id)
    perms = {}
    for p in [
        "can_ban",
        "can_mute",
        "can_manage_threads",
        "can_manage_users",
        "can_manage_roles",
        "can_grant_perks",
        "can_view_audit",
    ]:
        perms[p] = any(getattr(r, p, False) for r in roles)
    return perms


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
        granted_perks=list(user.granted_perks or []),
        case_keys=user.case_keys,
        bonus_xp=user.bonus_xp,
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


@router.get("/me/permissions")
async def my_permissions(actor: StaffUser, db: DbSession) -> dict:
    """Return the set of granular permissions the current staff user has.
    Frontend uses this to show/hide actions in the admin UI."""
    return await _user_permissions(db, actor)


@router.post("/users/{user_id}/ban", response_model=AdminUserRead)
async def ban(user_id: int, payload: BanRequest, actor: BanActor, db: DbSession) -> AdminUserRead:
    user = await admin_service.ban_user(
        db, actor=actor, target_id=user_id, reason=payload.reason, duration_hours=payload.duration_hours
    )
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/unban", response_model=AdminUserRead)
async def unban(user_id: int, actor: BanActor, db: DbSession) -> AdminUserRead:
    user = await admin_service.unban_user(db, actor=actor, target_id=user_id)
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/mute", response_model=AdminUserRead)
async def mute(user_id: int, payload: MuteRequest, actor: MuteActor, db: DbSession) -> AdminUserRead:
    user = await admin_service.mute_user(
        db, actor=actor, target_id=user_id, reason=payload.reason, duration_hours=payload.duration_hours
    )
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/unmute", response_model=AdminUserRead)
async def unmute(user_id: int, actor: MuteActor, db: DbSession) -> AdminUserRead:
    user = await admin_service.unmute_user(db, actor=actor, target_id=user_id)
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/thread-creation", response_model=AdminUserRead)
async def set_thread_creation(
    user_id: int, payload: ThreadCreationRequest, actor: ThreadActor, db: DbSession
) -> AdminUserRead:
    user = await admin_service.set_thread_creation(
        db, actor=actor, target_id=user_id, can_create=payload.can_create, reason=payload.reason
    )
    return await _serialize_admin_user(db, user)


@router.post("/users/{user_id}/role/{role_slug}", response_model=AdminUserRead)
async def grant_role(user_id: int, role_slug: str, actor: UsersActor, db: DbSession) -> AdminUserRead:
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
async def revoke_role(user_id: int, role_slug: str, actor: UsersActor, db: DbSession) -> AdminUserRead:
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
async def lock_section(slug: str, payload: ThreadLockRequest, actor: ThreadActor, db: DbSession) -> dict:
    section = await admin_service.lock_section(db, actor=actor, slug=slug, locked=payload.locked)
    return {"slug": section.slug, "is_locked": section.is_locked}


# -----------------------------------------------------------------------------
# Thread / post moderation
# -----------------------------------------------------------------------------

@router.post("/threads/{thread_id}/lock")
async def lock_thread(thread_id: int, payload: ThreadLockRequest, actor: ThreadActor, db: DbSession) -> dict:
    thread = await admin_service.lock_thread(db, actor=actor, thread_id=thread_id, locked=payload.locked)
    return {"id": thread.id, "is_locked": thread.is_locked}


@router.post("/posts/{post_id}/delete")
async def delete_post(
    post_id: int, payload: DeletePostRequest, actor: ThreadActor, db: DbSession
) -> dict:
    post = await admin_service.delete_post(db, actor=actor, post_id=post_id, reason=payload.reason)
    return {"id": post.id, "is_deleted": post.is_deleted}


# -----------------------------------------------------------------------------
# Roles management
# -----------------------------------------------------------------------------

PROTECTED_ROLE_SLUGS = {"owner", "admin", "member"}


PERMISSION_FIELDS = (
    "can_ban",
    "can_mute",
    "can_manage_threads",
    "can_manage_users",
    "can_manage_roles",
    "can_grant_perks",
    "can_view_audit",
)


def _serialize_role(role: Role, member_count: int) -> RoleAdminRead:
    return RoleAdminRead(
        id=role.id,
        slug=role.slug,
        title=role.title,
        color=role.color,
        display_order=role.display_order,
        is_staff=role.is_staff,
        member_count=member_count,
        can_ban=role.can_ban,
        can_mute=role.can_mute,
        can_manage_threads=role.can_manage_threads,
        can_manage_users=role.can_manage_users,
        can_manage_roles=role.can_manage_roles,
        can_grant_perks=role.can_grant_perks,
        can_view_audit=role.can_view_audit,
    )


@router.get("/roles", response_model=list[RoleAdminRead])
async def list_roles(db: DbSession) -> list[RoleAdminRead]:
    rows = await db.execute(select(Role).order_by(Role.display_order, Role.id))
    roles = list(rows.scalars().all())
    if not roles:
        return []
    cnt_rows = await db.execute(
        select(UserRole.role_id, func.count())
        .where(UserRole.role_id.in_([r.id for r in roles]))
        .group_by(UserRole.role_id)
    )
    counts = {rid: int(c) for rid, c in cnt_rows.all()}
    return [_serialize_role(r, counts.get(r.id, 0)) for r in roles]


@router.post("/roles", response_model=RoleAdminRead, status_code=status.HTTP_201_CREATED)
async def create_role(payload: RoleCreate, actor: RolesActor, db: DbSession) -> RoleAdminRead:
    existing = await db.execute(select(Role).where(Role.slug == payload.slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug уже занят")
    role = Role(
        slug=payload.slug,
        title=payload.title,
        color=payload.color,
        display_order=payload.display_order,
        is_staff=payload.is_staff,
        can_ban=payload.can_ban,
        can_mute=payload.can_mute,
        can_manage_threads=payload.can_manage_threads,
        can_manage_users=payload.can_manage_users,
        can_manage_roles=payload.can_manage_roles,
        can_grant_perks=payload.can_grant_perks,
        can_view_audit=payload.can_view_audit,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return _serialize_role(role, 0)


@router.patch("/roles/{slug}", response_model=RoleAdminRead)
async def update_role(
    slug: str, payload: RoleUpdate, actor: RolesActor, db: DbSession
) -> RoleAdminRead:
    result = await db.execute(select(Role).where(Role.slug == slug))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Роль не найдена")
    if payload.title is not None:
        role.title = payload.title
    if payload.color is not None:
        role.color = payload.color
    if payload.display_order is not None:
        role.display_order = payload.display_order
    if payload.is_staff is not None:
        if slug in PROTECTED_ROLE_SLUGS and not payload.is_staff and role.is_staff:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Нельзя снять флаг staff с защищённой роли {slug}",
            )
        role.is_staff = payload.is_staff
    # Apply granular permission updates
    for perm in PERMISSION_FIELDS:
        val = getattr(payload, perm)
        if val is not None:
            setattr(role, perm, val)
    await db.commit()
    await db.refresh(role)
    cnt_q = await db.execute(
        select(func.count()).select_from(UserRole).where(UserRole.role_id == role.id)
    )
    return _serialize_role(role, int(cnt_q.scalar_one()))


@router.delete("/roles/{slug}")
async def delete_role(slug: str, actor: RolesActor, db: DbSession) -> dict:
    if slug in PROTECTED_ROLE_SLUGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Нельзя удалить защищённую роль {slug}",
        )
    result = await db.execute(select(Role).where(Role.slug == slug))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Роль не найдена")
    # Cascade ondelete CASCADE on user_roles handles removing assignments
    await db.delete(role)
    await db.commit()
    return {"slug": slug, "deleted": True}


# -----------------------------------------------------------------------------
# Audit log
# -----------------------------------------------------------------------------

@router.get("/audit", response_model=list[ModerationLogRead])
async def list_audit(
    actor: AuditActor,
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[ModerationLogRead]:
    rows = await admin_service.list_audit(db, limit=limit, offset=offset)
    return [ModerationLogRead.model_validate(r) for r in rows]


# -----------------------------------------------------------------------------
# Manually-granted user perks (bypass level gate)
# -----------------------------------------------------------------------------

@router.post("/users/{user_id}/perks", response_model=AdminUserRead)
async def set_user_perks(
    user_id: int,
    payload: PerksUpdate,
    actor: PerksActor,
    db: DbSession,
) -> AdminUserRead:
    """Replace the user's granted_perks with the given list (whitelisted)."""
    invalid = set(payload.perks) - ALLOWED_PERKS
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неизвестные перки: {sorted(invalid)}",
        )

    target = await admin_service.get_user_or_404(db, user_id)
    new_perks = sorted(set(payload.perks))
    target.granted_perks = new_perks

    from app.models.moderation import ModerationLog

    db.add(
        ModerationLog(
            actor_id=actor.id,
            target_user_id=target.id,
            action="perks_granted",
            reason=", ".join(new_perks) if new_perks else "—",
        )
    )
    await db.commit()
    await db.refresh(target)
    return await _serialize_admin_user(db, target)


@router.post("/users/{user_id}/keys", response_model=AdminUserRead)
async def grant_user_keys(
    user_id: int,
    payload: KeysGrantRequest,
    actor: PerksActor,
    db: DbSession,
) -> AdminUserRead:
    """Grant or revoke case keys. Positive amount adds N audit rows in
    user_keys + bumps the cached counter. Negative consumes the oldest
    unspent keys (effective revoke), capped at the user's current count."""
    from datetime import UTC, datetime

    from app.models.case import UserKey
    from app.models.moderation import ModerationLog
    from sqlalchemy import select as _select

    target = await admin_service.get_user_or_404(db, user_id)
    delta = payload.amount

    if delta == 0:
        return await _serialize_admin_user(db, target)

    if delta > 0:
        now = datetime.now(UTC)
        for _ in range(delta):
            db.add(
                UserKey(
                    user_id=target.id,
                    granted_for=f"admin:{payload.reason or 'manual'}",
                    granted_at=now,
                )
            )
        target.case_keys = (target.case_keys or 0) + delta
    else:
        # Revoke: consume up to |delta| oldest unspent keys
        revoke_n = min(-delta, target.case_keys or 0)
        if revoke_n > 0:
            keys_q = await db.execute(
                _select(UserKey)
                .where(UserKey.user_id == target.id, UserKey.consumed_at.is_(None))
                .order_by(UserKey.granted_at)
                .limit(revoke_n)
            )
            for k in keys_q.scalars().all():
                k.consumed_at = datetime.now(UTC)
            target.case_keys = max(0, (target.case_keys or 0) - revoke_n)

    db.add(
        ModerationLog(
            actor_id=actor.id,
            target_user_id=target.id,
            action="keys_granted" if delta > 0 else "keys_revoked",
            reason=f"{delta:+d} ключ(а): {payload.reason or '—'}",
        )
    )
    await db.commit()
    await db.refresh(target)
    return await _serialize_admin_user(db, target)
