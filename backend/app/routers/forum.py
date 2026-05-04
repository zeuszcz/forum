from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.models.user import User
from app.schemas.forum import (
    PostCreate,
    PostRead,
    PostUpdate,
    SectionRead,
    ThreadCreate,
    ThreadRead,
    ThreadWithPostsRead,
)
from app.schemas.user import RoleRead, UserPublic
from app.services import auth as auth_service
from app.services import forum as forum_service

router = APIRouter(tags=["forum"])


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
        nick_color=user.nick_color,
        avatar_glow_color=user.avatar_glow_color,
    )


async def _users_by_ids(db: AsyncSession, ids: set[int]) -> dict[int, User]:
    if not ids:
        return {}
    rows = await db.execute(select(User).where(User.id.in_(ids)))
    return {u.id: u for u in rows.scalars().all()}


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------

@router.get("/sections", response_model=list[SectionRead])
async def list_sections(db: DbSession) -> list[SectionRead]:
    """Return forum sections grouped into a two-level tree.

    Top-level sections (parent_id IS NULL) are returned with their direct
    children attached via the `children` field. Leaf-only sections are also
    returned at the top level for backwards compatibility — clients that
    don't render hierarchies just iterate flat and ignore `children`.
    """
    sections = await forum_service.list_sections(db)
    by_parent: dict[int | None, list[SectionRead]] = {}
    for s in sections:
        node = SectionRead.model_validate(s)
        node.children = []
        by_parent.setdefault(s.parent_id, []).append(node)
    # Attach children
    out: list[SectionRead] = []
    for node in by_parent.get(None, []):
        node.children = by_parent.get(node.id, [])
        out.append(node)
    return out


@router.get("/sections/{slug}", response_model=SectionRead)
async def get_section(slug: str, db: DbSession) -> SectionRead:
    section = await forum_service.get_section_by_slug(db, slug)
    return SectionRead.model_validate(section)


# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------

@router.get("/sections/{slug}/threads")
async def list_section_threads(
    slug: str,
    db: DbSession,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict:
    section = await forum_service.get_section_by_slug(db, slug)
    threads, total = await forum_service.list_threads_by_section(
        db, section.id, limit=limit, offset=offset
    )
    user_ids = {t.author_id for t in threads if t.author_id} | {
        t.last_post_author_id for t in threads if t.last_post_author_id
    }
    users = await _users_by_ids(db, user_ids)

    serialized: list[ThreadRead] = []
    for t in threads:
        author = users.get(t.author_id) if t.author_id else None
        last_author = users.get(t.last_post_author_id) if t.last_post_author_id else None
        serialized.append(
            ThreadRead(
                id=t.id,
                section_id=t.section_id,
                title=t.title,
                slug=t.slug,
                is_pinned=t.is_pinned,
                is_locked=t.is_locked,
                view_count=t.view_count,
                reply_count=t.reply_count,
                last_post_at=t.last_post_at,
                created_at=t.created_at,
                author=await _user_to_public(db, author) if author else None,
                last_post_author=await _user_to_public(db, last_author) if last_author else None,
            )
        )
    return {
        "section": SectionRead.model_validate(section),
        "threads": serialized,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/threads/hot", response_model=list[ThreadRead])
async def list_hot_threads(
    db: DbSession,
    limit: int = Query(5, ge=1, le=20),
    hours: int = Query(24, ge=1, le=168),
) -> list[ThreadRead]:
    threads = await forum_service.list_hot_threads(db, limit=limit, hours=hours)
    user_ids = {t.author_id for t in threads if t.author_id} | {
        t.last_post_author_id for t in threads if t.last_post_author_id
    }
    users = await _users_by_ids(db, user_ids)
    out: list[ThreadRead] = []
    for t in threads:
        author = users.get(t.author_id) if t.author_id else None
        last_author = users.get(t.last_post_author_id) if t.last_post_author_id else None
        out.append(
            ThreadRead(
                id=t.id,
                section_id=t.section_id,
                title=t.title,
                slug=t.slug,
                is_pinned=t.is_pinned,
                is_locked=t.is_locked,
                view_count=t.view_count,
                reply_count=t.reply_count,
                last_post_at=t.last_post_at,
                created_at=t.created_at,
                author=await _user_to_public(db, author) if author else None,
                last_post_author=await _user_to_public(db, last_author) if last_author else None,
            )
        )
    return out


@router.get("/threads/recent", response_model=list[ThreadRead])
async def list_recent_threads(db: DbSession, limit: int = Query(10, ge=1, le=30)) -> list[ThreadRead]:
    threads = await forum_service.list_recent_threads(db, limit=limit)
    user_ids = {t.author_id for t in threads if t.author_id} | {
        t.last_post_author_id for t in threads if t.last_post_author_id
    }
    users = await _users_by_ids(db, user_ids)
    out: list[ThreadRead] = []
    for t in threads:
        author = users.get(t.author_id) if t.author_id else None
        last_author = users.get(t.last_post_author_id) if t.last_post_author_id else None
        out.append(
            ThreadRead(
                id=t.id,
                section_id=t.section_id,
                title=t.title,
                slug=t.slug,
                is_pinned=t.is_pinned,
                is_locked=t.is_locked,
                view_count=t.view_count,
                reply_count=t.reply_count,
                last_post_at=t.last_post_at,
                created_at=t.created_at,
                author=await _user_to_public(db, author) if author else None,
                last_post_author=await _user_to_public(db, last_author) if last_author else None,
            )
        )
    return out


@router.post("/sections/{slug}/threads", response_model=ThreadRead, status_code=status.HTTP_201_CREATED)
async def create_thread(
    slug: str,
    payload: ThreadCreate,
    user: CurrentUser,
    db: DbSession,
) -> ThreadRead:
    section = await forum_service.get_section_by_slug(db, slug)
    thread = await forum_service.create_thread(db, section=section, author=user, payload=payload)
    return ThreadRead(
        id=thread.id,
        section_id=thread.section_id,
        title=thread.title,
        slug=thread.slug,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        view_count=thread.view_count,
        reply_count=thread.reply_count,
        last_post_at=thread.last_post_at,
        created_at=thread.created_at,
        author=await _user_to_public(db, user),
        last_post_author=await _user_to_public(db, user),
    )


@router.get("/threads/{thread_id}", response_model=ThreadWithPostsRead)
async def get_thread(
    thread_id: int,
    db: DbSession,
    current_user: OptionalUser,
) -> ThreadWithPostsRead:
    thread, posts, section, counts = await forum_service.get_thread_with_posts(
        db, thread_id, current_user_id=current_user.id if current_user else None
    )
    user_ids = {p.author_id for p in posts if p.author_id}
    user_ids.update(p.edited_by_id for p in posts if p.edited_by_id)
    if thread.author_id:
        user_ids.add(thread.author_id)
    if thread.last_post_author_id:
        user_ids.add(thread.last_post_author_id)
    users = await _users_by_ids(db, user_ids)

    # Per-post "thanked_by" — users who reacted with kind='thanks'.
    thanked_by_post: dict[int, list[str]] = {}
    if posts:
        from sqlalchemy import select as _select

        from app.models.thread import Reaction
        from app.models.user import User

        post_ids = [p.id for p in posts]
        rows = await db.execute(
            _select(Reaction.post_id, User.nickname)
            .join(User, User.id == Reaction.user_id)
            .where(Reaction.post_id.in_(post_ids), Reaction.kind == "thanks")
            .order_by(Reaction.created_at.desc())
        )
        for pid, nick in rows.all():
            thanked_by_post.setdefault(pid, []).append(nick)

    post_reads: list[PostRead] = []
    for p in posts:
        author = users.get(p.author_id) if p.author_id else None
        editor = users.get(p.edited_by_id) if p.edited_by_id else None
        cnt = counts.get(p.id, {"count": 0, "by_kind": {}, "my_kinds": []})
        post_reads.append(
            PostRead(
                id=p.id,
                thread_id=p.thread_id,
                body=p.body,
                is_first=p.is_first,
                parent_post_id=p.parent_post_id,
                edited_at=p.edited_at,
                edited_by=await _user_to_public(db, editor) if editor else None,
                created_at=p.created_at,
                author=await _user_to_public(db, author) if author else None,
                reaction_count=cnt["count"],
                has_reacted=len(cnt["my_kinds"]) > 0,
                reactions_by_kind=cnt["by_kind"],
                my_reaction_kinds=cnt["my_kinds"],
                thanked_by=thanked_by_post.get(p.id, []),
            )
        )

    author = users.get(thread.author_id) if thread.author_id else None
    last_author = users.get(thread.last_post_author_id) if thread.last_post_author_id else None

    thread_read = ThreadRead(
        id=thread.id,
        section_id=thread.section_id,
        title=thread.title,
        slug=thread.slug,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        view_count=thread.view_count,
        reply_count=thread.reply_count,
        last_post_at=thread.last_post_at,
        created_at=thread.created_at,
        author=await _user_to_public(db, author) if author else None,
        last_post_author=await _user_to_public(db, last_author) if last_author else None,
    )
    return ThreadWithPostsRead(
        thread=thread_read,
        posts=post_reads,
        section=SectionRead.model_validate(section),
        total_posts=len(post_reads),
    )


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------

@router.post("/threads/{thread_id}/posts", response_model=PostRead, status_code=status.HTTP_201_CREATED)
async def create_post(
    thread_id: int,
    payload: PostCreate,
    user: CurrentUser,
    db: DbSession,
) -> PostRead:
    post = await forum_service.create_post(db, thread_id=thread_id, author=user, payload=payload)
    return PostRead(
        id=post.id,
        thread_id=post.thread_id,
        body=post.body,
        is_first=post.is_first,
        parent_post_id=post.parent_post_id,
        edited_at=post.edited_at,
        created_at=post.created_at,
        author=await _user_to_public(db, user),
        reaction_count=0,
        has_reacted=False,
    )


@router.post("/posts/{post_id}/react")
async def toggle_reaction(
    post_id: int,
    user: CurrentUser,
    db: DbSession,
    kind: str = Query("like"),
) -> dict:
    return await forum_service.toggle_reaction(
        db, post_id=post_id, user_id=user.id, kind=kind
    )


@router.patch("/posts/{post_id}", response_model=PostRead)
async def edit_post_endpoint(
    post_id: int, payload: PostUpdate, user: CurrentUser, db: DbSession
) -> PostRead:
    from sqlalchemy import select as _select
    from app.models.thread import Post

    p_q = await db.execute(_select(Post).where(Post.id == post_id))
    post = p_q.scalar_one_or_none()
    if post is None or post.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пост не найден")
    if post.author_id != user.id:
        # Allow staff later — check user roles
        roles = await auth_service.get_user_roles(db, user.id)
        if not any(r.is_staff for r in roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет прав на правку")
    edited = await forum_service.edit_post(
        db, post=post, new_body=payload.body, editor_id=user.id
    )
    return PostRead(
        id=edited.id,
        thread_id=edited.thread_id,
        body=edited.body,
        is_first=edited.is_first,
        parent_post_id=edited.parent_post_id,
        edited_at=edited.edited_at,
        created_at=edited.created_at,
        author=await _user_to_public(db, user),
        reaction_count=0,
        has_reacted=False,
    )
