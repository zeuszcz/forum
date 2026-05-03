# endless·war

Forum for the **endless-war** CS 1.6 jail-mode community. Built premium from day one.

> **Status**: Phase 0 — scaffold. See [`docs/roadmap.md`](docs/roadmap.md).

## Stack

- **Backend** — FastAPI (Python 3.12) + SQLAlchemy 2 + Alembic + PostgreSQL 16 + Redis
- **Frontend** — Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Auth** — Steam OpenID 2.0 + email fallback + JWT
- **Storage** — MinIO (S3-compatible)
- **Real-time** — FastAPI WebSocket + Redis pub/sub *(Phase 2)*
- **Search** — Postgres FTS → Meilisearch *(Phase 2)*
- **Deploy** — Docker Compose + Caddy + GitHub Actions

## Quickstart

```bash
# 1. Clone
git clone https://github.com/zeuszcz/forum.git endless-war
cd endless-war

# 2. Env
cp .env.example .env
# edit .env — at minimum set SECRET_KEY and POSTGRES_PASSWORD

# 3. Up
docker compose up -d --build

# 4. Migrate
docker compose exec backend alembic upgrade head

# 5. Open
#   Frontend → http://localhost:3000
#   Backend  → http://localhost:8000/docs
#   MinIO UI → http://localhost:9001
```

Stop everything: `docker compose down`. Wipe volumes: `docker compose down -v`.

## Repo layout

```
forum/
├── backend/          FastAPI service
│   ├── app/          Application code
│   ├── alembic/      DB migrations
│   └── tests/
├── frontend/         Next.js app
│   ├── src/app/      App Router pages
│   ├── src/components/
│   └── public/       Static assets (logo, favicon)
├── docs/             Architecture, brand, roadmap
├── infra/            Caddy config, deploy scripts
└── docker-compose.yml
```

## Docs

- [`docs/architecture.md`](docs/architecture.md) — system overview
- [`docs/brand.md`](docs/brand.md) — palette, logo, voice
- [`docs/roadmap.md`](docs/roadmap.md) — phases, tickets, estimates

## Contributing

This is a single-author project for now. Conventional Commits required:
`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`.

## License

MIT — see [LICENSE](LICENSE).
