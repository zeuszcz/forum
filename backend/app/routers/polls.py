from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.models.poll import Poll, PollOption, PollVote
from app.models.thread import Thread
from app.schemas.poll import (
    PollCreate,
    PollOptionRead,
    PollRead,
    PollVoteRequest,
)
from app.services import auth as auth_service

router = APIRouter(tags=["polls"])


# ---- helpers --------------------------------------------------------------

def _level(posts: int, reacts: int) -> int:
    """Mirror lib/rank.ts."""
    import math

    xp = max(0, posts * 10 + reacts * 4)
    return int(math.sqrt(xp / 8))


async def _user_has_perk(db, user, perk: str, min_level: int) -> bool:
    """User can use the perk if level >= min_level OR perk is granted OR staff."""
    if perk in (user.granted_perks or []):
        return True
    if _level(user.total_posts, user.total_reactions_received) >= min_level:
        return True
    roles = await auth_service.get_user_roles(db, user.id)
    return any(r.is_staff for r in roles)


async def _serialize_poll(
    db, poll: Poll, current_user_id: int | None
) -> PollRead:
    options_q = await db.execute(
        select(PollOption).where(PollOption.poll_id == poll.id).order_by(PollOption.display_order, PollOption.id)
    )
    options = list(options_q.scalars().all())

    counts_rows = await db.execute(
        select(PollVote.option_id, func.count())
        .where(PollVote.poll_id == poll.id)
        .group_by(PollVote.option_id)
    )
    counts = {oid: int(c) for oid, c in counts_rows.all()}

    my_votes: list[int] = []
    if current_user_id is not None:
        mine_q = await db.execute(
            select(PollVote.option_id).where(
                PollVote.poll_id == poll.id, PollVote.user_id == current_user_id
            )
        )
        my_votes = [int(o) for (o,) in mine_q.all()]

    total = sum(counts.values())
    return PollRead(
        id=poll.id,
        thread_id=poll.thread_id,
        question=poll.question,
        multi=poll.multi,
        closed=poll.closed,
        total_votes=total,
        options=[
            PollOptionRead(
                id=o.id,
                text=o.text,
                display_order=o.display_order,
                vote_count=counts.get(o.id, 0),
            )
            for o in options
        ],
        my_votes=my_votes,
    )


# ---- endpoints ------------------------------------------------------------

@router.get("/threads/{thread_id}/poll", response_model=PollRead | None)
async def get_thread_poll(
    thread_id: int, db: DbSession, current_user: OptionalUser
) -> PollRead | None:
    res = await db.execute(select(Poll).where(Poll.thread_id == thread_id))
    poll = res.scalar_one_or_none()
    if poll is None:
        return None
    return await _serialize_poll(db, poll, current_user.id if current_user else None)


@router.post("/threads/{thread_id}/poll", response_model=PollRead, status_code=status.HTTP_201_CREATED)
async def create_thread_poll(
    thread_id: int, payload: PollCreate, user: CurrentUser, db: DbSession
) -> PollRead:
    # Only the thread author (or staff) can attach a poll
    thread_q = await db.execute(select(Thread).where(Thread.id == thread_id))
    thread = thread_q.scalar_one_or_none()
    if thread is None or thread.is_deleted:
        raise HTTPException(status_code=404, detail="Тема не найдена")

    roles = await auth_service.get_user_roles(db, user.id)
    is_staff = any(r.is_staff for r in roles)
    if thread.author_id != user.id and not is_staff:
        raise HTTPException(status_code=403, detail="Опрос может создать только автор темы")

    # Perk gate: create_polls (lvl 10)
    if not await _user_has_perk(db, user, "create_polls", 10):
        raise HTTPException(
            status_code=403,
            detail="Создание опросов открывается на lvl 10 (или выдаст админ)",
        )

    # One poll per thread
    existing_q = await db.execute(select(Poll).where(Poll.thread_id == thread_id))
    if existing_q.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="В этой теме уже есть опрос")

    poll = Poll(thread_id=thread_id, question=payload.question.strip(), multi=payload.multi)
    db.add(poll)
    await db.flush()

    for idx, opt in enumerate(payload.options):
        db.add(
            PollOption(
                poll_id=poll.id,
                text=opt.text.strip(),
                display_order=idx,
            )
        )
    await db.commit()
    await db.refresh(poll)
    return await _serialize_poll(db, poll, user.id)


@router.post("/polls/{poll_id}/vote", response_model=PollRead)
async def vote(
    poll_id: int, payload: PollVoteRequest, user: CurrentUser, db: DbSession
) -> PollRead:
    poll_q = await db.execute(select(Poll).where(Poll.id == poll_id))
    poll = poll_q.scalar_one_or_none()
    if poll is None:
        raise HTTPException(status_code=404, detail="Опрос не найден")
    if poll.closed:
        raise HTTPException(status_code=403, detail="Опрос закрыт")

    # Perk gate: vote_polls (lvl 5)
    if not await _user_has_perk(db, user, "vote_polls", 5):
        raise HTTPException(
            status_code=403,
            detail="Голосование открывается на lvl 5 (или выдаст админ)",
        )

    if not poll.multi and len(payload.option_ids) != 1:
        raise HTTPException(status_code=400, detail="В этом опросе можно выбрать только один вариант")

    # Validate option_ids belong to this poll
    valid_q = await db.execute(
        select(PollOption.id).where(
            PollOption.poll_id == poll.id, PollOption.id.in_(payload.option_ids)
        )
    )
    valid_ids = {int(oid) for (oid,) in valid_q.all()}
    if valid_ids != set(payload.option_ids):
        raise HTTPException(status_code=400, detail="Неверные option_ids")

    # Wipe previous votes from this user, then insert new ones
    await db.execute(
        PollVote.__table__.delete().where(
            PollVote.poll_id == poll.id, PollVote.user_id == user.id
        )
    )
    for oid in payload.option_ids:
        db.add(PollVote(poll_id=poll.id, option_id=oid, user_id=user.id))
    await db.commit()
    return await _serialize_poll(db, poll, user.id)
