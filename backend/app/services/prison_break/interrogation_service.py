"""prison_break — interrogation theatre.

Two-actor session: an interrogator and a suspect. Both have private
state. Pressure is the central scalar 0..100:
  • starts at 50
  • interrogator tactics push it up: bluff +6/-3, threat +10/-8, offer +4
  • suspect tactics push it down: silence -3, truth -10, lie ±depending

Resolution:
  pressure >= 80           -> confession (interrogator learns the topic)
  pressure <= 20           -> silence  (suspect endured, interrogator wastes AP)
  rounds_remaining == 0    -> resolved by current pressure midpoint
  interrogator aborts      -> aborted (no penalty either way)

Confession effects:
  * If topic == 'tunnel'    -> cell.tunnel_discovered = True (best alibi)
  * If topic == 'alliance'  -> all alliances suspect is in get exposed via intel
  * If topic == 'intel_leak' -> drop a true intel about suspect's role
  * If topic == 'role'      -> intel atom revealing suspect.role to interrogator

Silence effects:
  * Trust -8 between suspect <-> interrogator
  * Intel atom seeded among prisoners: "X крепкий — допросом не сломать"

Frame effect (interrogator tactic 'lie' executed after rounds_remaining>=2):
  * Planted intel atom claiming suspect is a snitch — fabricated=True

AP costs:
  start            -> 2 AP, interrogator side
  each question    -> 1 AP, interrogator side
  suspect answer   -> 0 AP (defender pays nothing)
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prison_break import (
    PrisonBreakAction,
    PrisonBreakAlliance,
    PrisonBreakCell,
    PrisonBreakIntel,
    PrisonBreakIntelView,
    PrisonBreakPlayer,
)
from app.models.prison_break.extras import (
    PrisonBreakEventLog,
    PrisonBreakInterrogation,
    PrisonBreakInterrogationTurn,
)
from app.services.prison_break.trust_service import adjust as adjust_trust


AP_COST_START = 2
AP_COST_QUESTION = 1
START_ROUNDS = 3

VALID_TOPICS: set[str] = {
    "general", "tunnel", "alliance", "intel_leak", "role",
}

INTERROGATOR_TACTICS: dict[str, int] = {
    "ask":    +2,
    "bluff":  +6,
    "threat": +10,
    "offer":  +4,
}

SUSPECT_TACTICS: dict[str, int] = {
    "truth":   -10,  # cooperate -> pressure drops, trust unchanged
    "lie":     +4,   # lying -> pressure inches up (interrogator senses it)
    "silence": -3,   # stoic -> small drop
}

ELIGIBLE_INTERROGATOR_ROLES: set[str] = {"guard", "authority", "boss"}


# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------


async def start(
    db: AsyncSession,
    interrogator: PrisonBreakPlayer,
    suspect_id: int,
    topic: str,
) -> PrisonBreakInterrogation:
    if interrogator.role not in ELIGIBLE_INTERROGATOR_ROLES:
        raise PermissionError(
            "допрашивать могут только охрана, авторитеты и босс"
        )
    if topic not in VALID_TOPICS:
        raise ValueError(f"unknown topic {topic!r}")
    if interrogator.ap_current < AP_COST_START:
        raise PermissionError(
            f"нужно {AP_COST_START} AP, у тебя {interrogator.ap_current}"
        )

    suspect = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.id == suspect_id,
            PrisonBreakPlayer.event_id == interrogator.event_id,
            PrisonBreakPlayer.status == "active",
        )
    )).scalar_one_or_none()
    if suspect is None:
        raise ValueError("подозреваемый не найден")
    if suspect.id == interrogator.id:
        raise ValueError("себя не допросить")

    # Prevent double-active sessions between the same pair.
    existing = (await db.execute(
        select(PrisonBreakInterrogation).where(
            PrisonBreakInterrogation.interrogator_id == interrogator.id,
            PrisonBreakInterrogation.suspect_id == suspect.id,
            PrisonBreakInterrogation.status == "active",
        )
    )).scalar_one_or_none()
    if existing is not None:
        raise ValueError("уже идёт допрос этого игрока")

    interrogator.ap_current = max(0, interrogator.ap_current - AP_COST_START)

    session = PrisonBreakInterrogation(
        event_id=interrogator.event_id,
        interrogator_id=interrogator.id,
        suspect_id=suspect.id,
        topic=topic,
        status="active",
        rounds_remaining=START_ROUNDS,
        pressure=50,
        trust_loss=0,
    )
    db.add(session)
    await db.flush()

    db.add(PrisonBreakInterrogationTurn(
        interrogation_id=session.id,
        role="system",
        speaker_id=interrogator.id,
        tactic="ask",
        body=f"Открыт допрос на тему «{topic}»",
        delta_pressure=0,
    ))

    db.add(PrisonBreakAction(
        event_id=interrogator.event_id,
        actor_id=interrogator.id,
        target_id=suspect.id,
        action_type="interrogation_start",
        ap_spent=AP_COST_START,
        success=True,
        extra={"session_id": session.id, "topic": topic},
    ))

    db.add(PrisonBreakEventLog(
        event_id=interrogator.event_id,
        kind="interrogation_start",
        visibility="private",
        actor_id=interrogator.id,
        target_id=suspect.id,
        payload={"session_id": session.id, "topic": topic},
    ))
    return session


# ---------------------------------------------------------------------------
# Question / Answer
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TurnResult:
    pressure: int
    rounds_remaining: int
    status: str
    outcome: dict[str, Any]


async def submit_question(
    db: AsyncSession,
    interrogator: PrisonBreakPlayer,
    session_id: int,
    tactic: str,
    body: str,
) -> TurnResult:
    session = await _get_session_for(db, interrogator, session_id, side="interrogator")
    if session.status != "active":
        raise ValueError(f"сессия уже {session.status}")
    if tactic not in INTERROGATOR_TACTICS:
        raise ValueError(f"unknown tactic {tactic!r}")
    if interrogator.ap_current < AP_COST_QUESTION:
        raise PermissionError(
            f"нужно {AP_COST_QUESTION} AP, у тебя {interrogator.ap_current}"
        )

    interrogator.ap_current = max(0, interrogator.ap_current - AP_COST_QUESTION)
    delta = INTERROGATOR_TACTICS[tactic]
    session.pressure = max(0, min(100, session.pressure + delta))
    session.rounds_remaining = max(0, session.rounds_remaining - 1)

    db.add(PrisonBreakInterrogationTurn(
        interrogation_id=session.id,
        role="question",
        speaker_id=interrogator.id,
        tactic=tactic,
        body=body[:500],
        delta_pressure=delta,
    ))
    return await _maybe_resolve(db, session)


async def submit_answer(
    db: AsyncSession,
    suspect: PrisonBreakPlayer,
    session_id: int,
    tactic: str,
    body: str,
) -> TurnResult:
    session = await _get_session_for(db, suspect, session_id, side="suspect")
    if session.status != "active":
        raise ValueError(f"сессия уже {session.status}")
    if tactic not in SUSPECT_TACTICS:
        raise ValueError(f"unknown tactic {tactic!r}")
    delta = SUSPECT_TACTICS[tactic]
    session.pressure = max(0, min(100, session.pressure + delta))

    db.add(PrisonBreakInterrogationTurn(
        interrogation_id=session.id,
        role="answer",
        speaker_id=suspect.id,
        tactic=tactic,
        body=body[:500],
        delta_pressure=delta,
    ))
    return await _maybe_resolve(db, session)


async def abort(
    db: AsyncSession,
    interrogator: PrisonBreakPlayer,
    session_id: int,
) -> PrisonBreakInterrogation:
    session = await _get_session_for(db, interrogator, session_id, side="interrogator")
    if session.status != "active":
        return session
    session.status = "aborted"
    session.ended_at = datetime.now(UTC)
    session.outcome = {"aborted_by": interrogator.id}
    db.add(PrisonBreakInterrogationTurn(
        interrogation_id=session.id,
        role="system",
        speaker_id=interrogator.id,
        tactic="ask",
        body="Допрос прерван",
        delta_pressure=0,
    ))
    return session


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def list_for_player(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    *,
    limit: int = 20,
) -> list[PrisonBreakInterrogation]:
    rows = await db.execute(
        select(PrisonBreakInterrogation)
        .where(
            PrisonBreakInterrogation.event_id == player.event_id,
            (
                (PrisonBreakInterrogation.interrogator_id == player.id)
                | (PrisonBreakInterrogation.suspect_id == player.id)
            ),
        )
        .order_by(PrisonBreakInterrogation.id.desc())
        .limit(min(50, limit))
    )
    return list(rows.scalars())


async def list_turns(
    db: AsyncSession,
    session: PrisonBreakInterrogation,
) -> list[PrisonBreakInterrogationTurn]:
    rows = await db.execute(
        select(PrisonBreakInterrogationTurn)
        .where(PrisonBreakInterrogationTurn.interrogation_id == session.id)
        .order_by(PrisonBreakInterrogationTurn.id.asc())
    )
    return list(rows.scalars())


async def get_owned(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    session_id: int,
) -> PrisonBreakInterrogation:
    s = (await db.execute(
        select(PrisonBreakInterrogation).where(
            PrisonBreakInterrogation.id == session_id,
        )
    )).scalar_one_or_none()
    if s is None:
        raise ValueError("допрос не найден")
    if player.id not in (s.interrogator_id, s.suspect_id):
        raise PermissionError("ты не участник этого допроса")
    return s


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


async def _get_session_for(
    db: AsyncSession,
    player: PrisonBreakPlayer,
    session_id: int,
    *,
    side: str,
) -> PrisonBreakInterrogation:
    s = (await db.execute(
        select(PrisonBreakInterrogation).where(
            PrisonBreakInterrogation.id == session_id,
        )
    )).scalar_one_or_none()
    if s is None:
        raise ValueError("допрос не найден")
    field = s.interrogator_id if side == "interrogator" else s.suspect_id
    if field != player.id:
        raise PermissionError("ты не на этой стороне")
    return s


async def _maybe_resolve(
    db: AsyncSession,
    session: PrisonBreakInterrogation,
) -> TurnResult:
    outcome: dict[str, Any] = {}
    if session.pressure >= 80:
        await _resolve_confession(db, session)
        outcome = session.outcome or {}
    elif session.pressure <= 20:
        await _resolve_silence(db, session)
        outcome = session.outcome or {}
    elif session.rounds_remaining <= 0:
        # Midpoint resolve.
        if session.pressure >= 60:
            await _resolve_confession(db, session)
        elif session.pressure <= 40:
            await _resolve_silence(db, session)
        else:
            session.status = "aborted"
            session.ended_at = datetime.now(UTC)
            session.outcome = {"reason": "timeout_inconclusive"}
        outcome = session.outcome or {}
    return TurnResult(
        pressure=session.pressure,
        rounds_remaining=session.rounds_remaining,
        status=session.status,
        outcome=outcome,
    )


async def _resolve_confession(
    db: AsyncSession,
    session: PrisonBreakInterrogation,
) -> None:
    session.status = "confession"
    session.ended_at = datetime.now(UTC)
    payload: dict[str, Any] = {"pressure_at_end": session.pressure}

    interrogator = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == session.interrogator_id)
    )).scalar_one()
    suspect = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == session.suspect_id)
    )).scalar_one()

    if session.topic == "tunnel" and suspect.cell_id is not None:
        cell = (await db.execute(
            select(PrisonBreakCell).where(PrisonBreakCell.id == suspect.cell_id)
        )).scalar_one_or_none()
        if cell is not None:
            cell.tunnel_discovered = True
            payload["tunnel_discovered_cell_id"] = cell.id

    if session.topic == "alliance":
        alliances = (await db.execute(
            select(PrisonBreakAlliance).where(
                PrisonBreakAlliance.event_id == session.event_id,
                PrisonBreakAlliance.parties.any(suspect.id),
                PrisonBreakAlliance.status.in_(["proposed", "active"]),
            )
        )).scalars().all()
        leaked = []
        for a in alliances:
            atom = PrisonBreakIntel(
                event_id=session.event_id,
                content=(
                    f"Пакт {a.pact_type} раскрыт через допрос. Участники: "
                    f"{', '.join(str(p) for p in (a.parties or []))}"
                ),
                is_truth=True,
                category="leak",
                source_role=interrogator.role,
                source_user_id=interrogator.id,
                fabricated=False,
            )
            db.add(atom)
            await db.flush()
            db.add(PrisonBreakIntelView(
                intel_id=atom.id, viewer_id=interrogator.id, forwarded_from_id=None,
            ))
            leaked.append(a.id)
        payload["alliances_leaked"] = leaked

    if session.topic == "role":
        atom = PrisonBreakIntel(
            event_id=session.event_id,
            content=(
                f"Роль игрока {suspect.nickname}: {suspect.role}. "
                f"Сообщил под давлением."
            ),
            is_truth=True,
            category="secret",
            source_role=interrogator.role,
            source_user_id=interrogator.id,
            fabricated=False,
        )
        db.add(atom)
        await db.flush()
        db.add(PrisonBreakIntelView(
            intel_id=atom.id, viewer_id=interrogator.id, forwarded_from_id=None,
        ))
        payload["role_revealed"] = suspect.role

    if session.topic == "intel_leak":
        atom = PrisonBreakIntel(
            event_id=session.event_id,
            content=(
                f"{suspect.nickname} признал получение левого intel из блока "
                f"{suspect.block or '?'}."
            ),
            is_truth=True,
            category="leak",
            source_role=interrogator.role,
            source_user_id=interrogator.id,
            fabricated=False,
        )
        db.add(atom)
        await db.flush()
        db.add(PrisonBreakIntelView(
            intel_id=atom.id, viewer_id=interrogator.id, forwarded_from_id=None,
        ))

    # Confession dings the suspect-interrogator trust.
    session.trust_loss = 12
    await adjust_trust(
        db, session.event_id, session.interrogator_id, session.suspect_id, delta=-12,
    )

    session.outcome = payload
    db.add(PrisonBreakAction(
        event_id=session.event_id,
        actor_id=session.interrogator_id,
        target_id=session.suspect_id,
        action_type="interrogation_confession",
        ap_spent=0,
        success=True,
        extra={"session_id": session.id, "topic": session.topic, **payload},
    ))
    db.add(PrisonBreakEventLog(
        event_id=session.event_id,
        kind="interrogation_confession",
        visibility="private",
        actor_id=session.interrogator_id,
        target_id=session.suspect_id,
        payload={"session_id": session.id, "topic": session.topic},
    ))


async def _resolve_silence(
    db: AsyncSession,
    session: PrisonBreakInterrogation,
) -> None:
    session.status = "silence"
    session.ended_at = datetime.now(UTC)
    session.trust_loss = 8
    await adjust_trust(
        db, session.event_id, session.interrogator_id, session.suspect_id, delta=-8,
    )

    # Seed a rumor among prisoners: the suspect is tough.
    suspect = (await db.execute(
        select(PrisonBreakPlayer).where(PrisonBreakPlayer.id == session.suspect_id)
    )).scalar_one()

    atom = PrisonBreakIntel(
        event_id=session.event_id,
        content=f"{suspect.nickname} крепкий — допросом не сломать.",
        is_truth=True,
        category="rumor",
        source_role=None,
        source_user_id=None,
        fabricated=False,
    )
    db.add(atom)
    await db.flush()

    prisoners = (await db.execute(
        select(PrisonBreakPlayer).where(
            PrisonBreakPlayer.event_id == session.event_id,
            PrisonBreakPlayer.role == "prisoner",
            PrisonBreakPlayer.status == "active",
        )
    )).scalars().all()
    for p in prisoners[:8]:  # cap so we don't flood
        db.add(PrisonBreakIntelView(
            intel_id=atom.id, viewer_id=p.id, forwarded_from_id=None,
        ))
    session.outcome = {"silence_intel_id": atom.id, "delivered_to": len(prisoners[:8])}

    db.add(PrisonBreakAction(
        event_id=session.event_id,
        actor_id=session.interrogator_id,
        target_id=session.suspect_id,
        action_type="interrogation_silence",
        ap_spent=0,
        success=False,
        extra={"session_id": session.id, "topic": session.topic},
    ))
    db.add(PrisonBreakEventLog(
        event_id=session.event_id,
        kind="interrogation_silence",
        visibility="private",
        actor_id=session.interrogator_id,
        target_id=session.suspect_id,
        payload={"session_id": session.id, "topic": session.topic},
    ))
