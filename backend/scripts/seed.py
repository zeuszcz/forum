"""Seed initial roles and forum sections.

Idempotent — safe to re-run. Run inside the backend container:

    docker compose exec backend python -m scripts.seed
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.database import SessionLocal, engine
from app.models.role import Role
from app.models.section import Section


ROLES: list[dict] = [
    {"slug": "owner", "title": "Owner", "color": "#ec4899", "display_order": 1, "is_staff": True},
    {"slug": "admin", "title": "Admin", "color": "#a855f7", "display_order": 10, "is_staff": True},
    {"slug": "curator", "title": "Куратор", "color": "#7c5cff", "display_order": 20, "is_staff": True},
    {"slug": "moderator", "title": "Модератор", "color": "#22d3ee", "display_order": 30, "is_staff": True},
    {"slug": "patron", "title": "Меценат", "color": "#fbbf24", "display_order": 40, "is_staff": False},
    {"slug": "member", "title": "Игрок", "color": "#a0a3b8", "display_order": 100, "is_staff": False},
]


SECTIONS: list[dict] = [
    {
        "slug": "general",
        "title": "Главное",
        "description": "Общие обсуждения сообщества, новости, анонсы",
        "icon": "megaphone",
        "accent": "plasma",
        "display_order": 10,
    },
    {
        "slug": "ban-appeals",
        "title": "Бан-апелляции",
        "description": "Подача апелляций на бан, обсуждение разбирательств",
        "icon": "shield",
        "accent": "ember",
        "display_order": 20,
    },
    {
        "slug": "player-reports",
        "title": "Жалобы на игроков",
        "description": "Чит, RDM, токсичность — с демкой и таймкодом",
        "icon": "alert-triangle",
        "accent": "flame",
        "display_order": 30,
    },
    {
        "slug": "admin-applications",
        "title": "Заявки в администрацию",
        "description": "Хочешь стать админом или куратором — сюда",
        "icon": "user-check",
        "accent": "cyan",
        "display_order": 40,
    },
    {
        "slug": "suggestions",
        "title": "Предложения",
        "description": "Идеи по сборке, правилам, серверу",
        "icon": "lightbulb",
        "accent": "plasma",
        "display_order": 50,
    },
    {
        "slug": "off-topic",
        "title": "Off-topic",
        "description": "Вне CS — флуд, мемы, что угодно",
        "icon": "coffee",
        "accent": "plasma",
        "display_order": 100,
    },
]


async def seed() -> None:
    async with SessionLocal() as db:
        # roles
        for r in ROLES:
            existing = await db.execute(select(Role).where(Role.slug == r["slug"]))
            if existing.scalar_one_or_none() is None:
                db.add(Role(**r))
                print(f"+ role: {r['slug']}")
            else:
                print(f"= role: {r['slug']} (exists)")

        # sections
        for s in SECTIONS:
            existing = await db.execute(select(Section).where(Section.slug == s["slug"]))
            if existing.scalar_one_or_none() is None:
                db.add(Section(**s))
                print(f"+ section: {s['slug']}")
            else:
                print(f"= section: {s['slug']} (exists)")

        await db.commit()
        print("seed: done")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
