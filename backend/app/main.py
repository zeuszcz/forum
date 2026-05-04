from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.routers import (
    admin,
    attachments,
    auth,
    forum,
    health,
    notifications,
    polls,
    shoutbox,
    stats,
    steam,
    users,
)

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    log.info("app.start", env=settings.app_env, name=settings.app_name)
    yield
    log.info("app.stop")


app = FastAPI(
    title=settings.app_name,
    version="0.0.1",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(forum.router)
app.include_router(shoutbox.router)
app.include_router(stats.router)
app.include_router(admin.router)
app.include_router(polls.router)
app.include_router(notifications.router)
app.include_router(attachments.router)
app.include_router(steam.router)


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs", "health": "/healthz"}
