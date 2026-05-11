# endless-war Forum — Project Context

> Injected at every Claude Code session start via `.claude/settings.json` SessionStart hook.
> Source of truth for the LLM about what this project is, where things live, and how the pieces fit.

## What it is

**endless-war** is a forum for the CS 1.6 jail-mode community on `forum.innertalk.space`.
Single-author repo at https://github.com/zeuszcz/forum.git, MIT.
Premium-from-day-one — the visual brand and the live game integration are first-class, not bolted on.

## Stack

| Layer       | Tech                                                                  |
|-------------|-----------------------------------------------------------------------|
| Backend     | FastAPI (Python 3.12) + SQLAlchemy 2 + Alembic + PostgreSQL 16 + Redis|
| Frontend    | Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui             |
| Auth        | Steam OpenID 2.0 + email/JWT (http-only cookie)                       |
| Storage     | MinIO (S3-compatible)                                                 |
| Realtime    | FastAPI WebSocket, single uvicorn worker fanout (Redis pub/sub later) |
| Game bridge | `cs-log-listener` systemd unit → HLDS log_redirect_address → API      |
| Deploy      | Docker Compose (`docker-compose.yml` + `docker-compose.prod.yml`)     |
| Reverse proxy | nginx on host (`/etc/nginx/sites-available/forum.innertalk.space`)  |

Prod backend → `127.0.0.1:8030` (`endless-war-backend-1`).
Prod frontend → `127.0.0.1:3030` (`endless-war-frontend-1`).
Both gated behind nginx with Let's Encrypt.

## Repo layout

```
forum/
├── backend/                  FastAPI service
│   ├── app/
│   │   ├── core/             config, db, security, deps, caching
│   │   ├── models/           SQLAlchemy ORM
│   │   ├── routers/          API endpoints
│   │   ├── services/         Business logic (one module per domain)
│   │   ├── schemas/          Pydantic
│   │   └── main.py
│   ├── alembic/              DB migrations
│   ├── tests/
│   └── Dockerfile
├── frontend/                 Next.js app
│   ├── src/app/              App Router pages (RSC by default)
│   │   ├── page.tsx          Home — loads sections/threads/shoutbox SSR
│   │   ├── admin/            Admin panel (server-log, players, audit, jbf-commands)
│   │   ├── tools/            Public tools (bind-builder)
│   │   └── u/[nickname]/     Public profile
│   ├── src/components/forum/ Domain components (Shoutbox, HotThreads, …)
│   ├── src/lib/              api client, auth-context, formatters, types, chat helpers
│   └── Dockerfile
├── infra/                    cs-log-listener, jb-ftp-poller, RCON gateway scripts
├── docs/                     architecture.md, brand.md, roadmap.md
├── deploy/                   nginx + systemd units (mirrored from /etc/)
├── secondbrain/              ← this wiki
├── docker-compose.yml        dev base
└── docker-compose.prod.yml   prod overrides
```

## Key domains (alphabetical)

- **admin** — staff-only audit log, player roster, jbf_uaio_modular reference,
  server-log view (system-kind shoutbox messages live here).
- **auth** — Steam OpenID + email/JWT, http-only cookie, RBAC roles.
- **forums** — Section → Thread → Post linear view, TipTap markdown editor,
  6 base reactions, soft-delete, sticky.
- **mapvote** — `/mapvote` slash command in chat, inline poll widget.
- **mentions** — `@nickname` autocomplete in shoutbox; backend creates Notification rows.
- **notifications** — domain rows (`Notification`) + WS push.
- **perks** — granted-perks list per user (`nick_color`, `avatar_glow_color`, sticker unlocks).
- **rcon** — forum → CS server bridge with 5/10 s rate-limit + audit log;
  `amx_tsay` HUD banner for clean announces.
- **server-status** — 5 s cached server-side, refreshed by frontend every 15 s.
  Surfaced as pill in chat header + `<ServerStatusWidget>` on home.
- **shoutbox** — `/` home page chat. Single uvicorn worker WS fanout (`_Broadcaster`).
  Message kinds: `user` (default), `system` (bot-cast from cs-log-listener,
  admin-only — public chat hides them via `kind != "system"`), `mapvote` (inline poll).
- **stats** — sparklines, top users, activity, feed, section-pulse.
- **tools/bind-builder** — `jbf_uaio` bind constructor for начальники (17 presets).

## Critical invariants

- **Public chat hides `kind=system`**.
  Backend `list_recent` filters them; `/shoutbox/system-log` (staff-only) is the
  one place they appear. A burst of bot-cast events must not push real user
  messages out of the latest-N window of the home chat
  (regression fix 2026-05-11, commit pending push).
- **Single WS worker for shoutbox fanout**.
  `BROADCASTER` is in-process. Scaling past one uvicorn worker requires Redis
  pub/sub — track for Phase 2.
- **High-frequency feeds → ephemeral broadcast, no DB**.
  `POST /shoutbox/system` accepts `ephemeral=true`; the endpoint then
  emits a WS event of `type: "ephemeral_system"` and **does not** call
  `shoutbox_service.post_system` (no row in `shoutbox_messages`). Used
  by `cs-log-listener` for in-game chat (`category="chat"`) — without
  this branch every `say` line on the CS server would land in Postgres.
  Consumers: `/admin/cs-chat` Live-toggle subscribes and filters by
  `category`. Public `Shoutbox.tsx` ignores unknown WS event types so
  it is silent on this path.
- **Flood window 3 s** on chat post; 5 min edit window for own messages
  (mods bypass), `CLEAR_LIMIT=200` cap on `/clear`.
- **Polling fallback merges, never replaces** the chat state — see
  `Shoutbox.tsx` `refresh()` (regression fix 2026-05-11). Otherwise a WS hiccup
  wipes any "старше"-loaded older messages every 5 s.
- **`cs-log-listener` posts via `X-Shoutbox-Token`** HMAC header — never via user JWT.
  Endpoint returns 503 until `SHOUTBOX_SYSTEM_TOKEN` env is set.
- **rcon endpoint is rate-limited** (5 req / 10 s per user) + audit table.
- **Email + password is the only path that touches plaintext credentials**;
  Steam OpenID + JWT do not.
- **`mp_chattime` / map changes kick HLTV / cs-log-listener** — both have
  systemd auto-restart watchdogs.

## Deploy procedure

Working directory on VPS: `/home/i48ptgvnis/forum/` (alias `ssh site-vps`).

```bash
cd ~/forum
git pull
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml build backend frontend
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend frontend
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head
```

DB lives in `endless-war-postgres-1` (volume), Redis in `endless-war-redis-1`,
MinIO in `endless-war-minio-1` (all internal-only in prod).

## Where stuff lives on the host

- Repo: `/home/i48ptgvnis/forum/`
- nginx site: `/etc/nginx/sites-available/forum.innertalk.space`
- TLS: `/etc/letsencrypt/live/forum.innertalk.space/`
- cs-log-listener: `/opt/cs-log-listener/` + systemd `cs-log-listener.service`
- cs-log-poller (FTP backup tail): `/opt/cs-log-poller/`

## Active phase

`docs/roadmap.md` — Phase 0 done (scaffold), Phase 1 (MVP) in flight: auth,
forum CRUD, shoutbox polish, admin panel, basic stats. Realtime backbone +
Meilisearch search are Phase 2.
