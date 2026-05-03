# Architecture — endless·war

High-level system overview. Updated as the project evolves.

## Goals

1. **Premium-feeling forum** for a CS 1.6 jail community — better than mircs/XenForo defaults.
2. **CS-server tight integration** in Phase 3 (live presence, ban-sync, demo player).
3. **Modern stack** — async Python + RSC React, real-time first-class.
4. **Self-host friendly** — Docker Compose deploys on a single VPS for v1.

## Component diagram

```
                 ┌────────────────────────────────────────────┐
                 │                  Caddy                     │
                 │  TLS, reverse proxy, static, rate limit    │
                 └──────┬───────────────────────────┬─────────┘
                        │                           │
              ┌─────────▼─────────┐       ┌─────────▼──────────┐
              │   Next.js (RSC)   │       │     FastAPI        │
              │   :3000 internal  │       │   :8000 internal   │
              │  SSR, SEO, UI     │       │  REST + WebSocket  │
              └─────────┬─────────┘       └─────┬──────┬───────┘
                        │ fetch                  │      │
                        └────────────────────────┘      │
                                                        │
                ┌───────────────────┬───────────────────┼─────────────────┐
                ▼                   ▼                   ▼                 ▼
         ┌──────────┐       ┌──────────────┐    ┌──────────┐      ┌────────────┐
         │ Postgres │       │    Redis     │    │  MinIO   │      │ CS server  │
         │   16     │       │ cache+pubsub │    │  S3-API  │      │  (Phase 3) │
         └──────────┘       └──────────────┘    └──────────┘      └────────────┘
```

## Backend (`backend/`)

- **Framework**: FastAPI 0.115 + Uvicorn (production: 2 workers per CPU).
- **DB**: SQLAlchemy 2 async + asyncpg. Alembic for migrations (autogenerate from models).
- **Cache / sessions**: Redis 7 (also pub/sub bus for WebSocket fan-out).
- **Auth**: Steam OpenID 2.0 (primary), email+argon2id (fallback). JWT — access in memory, refresh in `httpOnly; secure; sameSite=lax` cookie.
- **Storage**: MinIO via boto3 (S3-compatible). All uploads go through backend (validation + virus scan in Phase 2).
- **Background**: Phase 1 — none. Phase 2+ — separate worker container (Arq or Dramatiq) for emails, image-resize, achievement triggers.
- **Logging**: structlog → JSON in prod, pretty in dev. Sentry SDK in prod.

### Layering rules

- `routers/` — thin: validate request → call service → serialize response. No DB queries inline beyond simple lookups.
- `services/` — business logic. Single responsibility per file. Async only.
- `models/` — SQLAlchemy ORM. No business logic.
- `schemas/` — Pydantic v2 DTOs. Separate `Create`, `Update`, `Read` shapes.
- `core/` — config, DB session, security primitives, deps.

## Frontend (`frontend/`)

- **Framework**: Next.js 15 App Router with React Server Components by default. Client components marked explicitly.
- **Data**: TanStack Query for client cache. Server components do direct `fetch` to backend.
- **State**: Zustand for ephemeral client state (UI toggles, draft buffers). No global app state — server is the truth.
- **Styling**: Tailwind 3 + shadcn/ui. Design tokens in `src/app/globals.css` as CSS variables, exposed via Tailwind theme. See [`docs/brand.md`](brand.md).
- **Routing**: file-based. Route groups for `(auth)`, `(forum)`, `(admin)`.
- **Forms**: React Hook Form + Zod schemas (shared with backend Pydantic shapes via codegen, Phase 2).

## Data layer

### Phase 0 entities (just `users`)

```
users
├── id            BIGINT PK
├── nickname      VARCHAR(64) UNIQUE
├── email         VARCHAR(255) UNIQUE NULL
├── password_hash VARCHAR(255) NULL          # argon2id
├── steam_id      VARCHAR(32)  UNIQUE NULL
├── avatar_url    VARCHAR(512) NULL
├── title, bio, signature
├── is_active, is_verified
└── last_seen_at, created_at, updated_at
```

### Phase 1 additions (preview)

- `roles`, `user_roles` — RBAC.
- `forums` — categories with `parent_id` self-FK (3-level max).
- `threads`, `posts` — with `forum_id`, `author_id`.
- `reactions`, `attachments`, `notifications`.

### Phase 2 additions

- `ban_appeals`, `player_reports`, `admin_applications` — structured workflow tables.
- `achievements`, `user_achievements`.
- `private_messages`, `pm_threads`.

## Security baseline

- Argon2id for passwords (libsodium-grade).
- JWT short-lived access (15 min) + refresh rotation (30 days).
- CORS strict to known origins.
- CSP via Caddy headers; per-page tightening via Next.js middleware.
- All user HTML goes through `bleach` allow-list before storage; markdown rendered server-side.
- Rate limit at Caddy + per-route limits in FastAPI (Redis-backed, Phase 1).
- File uploads: type sniffing (magic bytes), size cap, virus scan (ClamAV sidecar in Phase 2).
- Audit log table for every moderation action — append-only, indexed by `actor_id`, `target_type`, `created_at`.

## Real-time (Phase 2)

- FastAPI native WebSocket endpoint at `/ws`.
- Auth: pass JWT in connect query param, validated at handshake.
- Fan-out via Redis pub/sub: `channel:thread:{id}` for live threads, `channel:user:{id}` for personal notifications.
- Multi-instance backend possible because Redis is the bus.

## Deploy

Single VPS, Docker Compose, Caddy in front. Roles per container — no dev tooling in prod images. Backup via pg_dump → MinIO nightly + WAL archiving for v2. CI pushes to GHCR; deploy script does `docker compose pull && up -d` over SSH.

Domain TLS auto via Caddy + Let's Encrypt (HTTP-01 or DNS-01 if behind Cloudflare).

## What we deliberately don't do

- No microservices. One backend, one frontend. Workers added only when needed.
- No GraphQL. REST + typed OpenAPI client generation is enough.
- No Redux / MobX. Server state via TanStack Query, ephemeral via Zustand.
- No CSS-in-JS runtime cost. Tailwind only.
- No ORM other than SQLAlchemy — Drizzle / Prisma get cute about edge cases.
