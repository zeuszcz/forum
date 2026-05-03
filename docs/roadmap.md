# Roadmap — endless·war

Phase-based plan. Ticket IDs follow `E{phase}.{epic}.{n}`. Estimates are individual-developer hours.

---

## Phase 0 — Setup & Brand · ✅ done

Skeleton: monorepo, Docker dev env, FastAPI healthz, Next.js landing page with plasma-themed design system.

| ID | Done |
|----|------|
| E0.1 | Brand kit v0 — palette (deep ink + plasma gradient), 3 SVG logos |
| E0.2 | Repo init — README, LICENSE, gitignore, editorconfig, env.example |
| E0.3 | Monorepo structure — `backend/`, `frontend/`, `docs/`, `infra/` |
| E0.4 | Docker Compose dev — postgres, redis, minio, backend, frontend |
| E0.5 | CI baseline — lint + typecheck + test for both stacks |
| E0.6 | FastAPI skeleton — config, db, alembic, healthz, base User model |
| E0.7 | Next.js skeleton — App Router, Tailwind, shadcn theme, dark default |
| E0.8 | Design tokens — CSS vars + Tailwind theme bound to brand palette |

---

## Phase 1 — MVP · ⏳ next (~118h, 2.5–3 weeks full-time)

Public launchable version: register, post, moderate, basic admin.

### Epic A — Auth & Profiles (~28h)

| ID | Title | h |
|----|-------|---|
| E1.A.1 | User model + migration | 2 |
| E1.A.2 | Steam OpenID flow (callback + profile fetch) | 6 |
| E1.A.3 | Email signup/login + password reset | 5 |
| E1.A.4 | JWT access+refresh, http-only cookie | 3 |
| E1.A.5 | Profile view/edit (avatar, signature, bio, title) | 5 |
| E1.A.6 | Public profile `/u/[nickname]` | 4 |
| E1.A.7 | RBAC — roles, decorators, seed | 3 |

### Epic B — Forum CRUD (~28h)

| ID | Title | h |
|----|-------|---|
| E1.B.1 | Forum/Subforum model + seed (5 base sections) | 4 |
| E1.B.2 | Thread listing — pagination, sorting, sticky | 4 |
| E1.B.3 | Post linear view — author sidebar, post number | 4 |
| E1.B.4 | Markdown editor (TipTap) with preview tab | 6 |
| E1.B.5 | Image upload to MinIO + thumbnail worker | 4 |
| E1.B.6 | Quote / edit / soft-delete post | 3 |
| E1.B.7 | Reactions (6 base emojis) | 3 |

### Epic C — Discovery (~13h)

| ID | Title | h |
|----|-------|---|
| E1.C.1 | Home page — latest threads, online users | 5 |
| E1.C.2 | Search — Postgres FTS + filter UI | 5 |
| E1.C.3 | Category index | 3 |

### Epic D — Notifications & Engagement (~12h)

| ID | Title | h |
|----|-------|---|
| E1.D.1 | Notification model + service | 4 |
| E1.D.2 | Triggers — reply, mention, reaction | 3 |
| E1.D.3 | Email send via Resend | 3 |
| E1.D.4 | Online presence — heartbeat, last_seen | 2 |

### Epic E — Moderation (~14h)

| ID | Title | h |
|----|-------|---|
| E1.E.1 | Admin: users panel — ban/warn/unban | 5 |
| E1.E.2 | Thread/post moderation — lock/sticky/delete/move | 4 |
| E1.E.3 | Audit log + page | 3 |
| E1.E.4 | Report-post button | 2 |

### Epic F — UX & Polish (~12h)

| ID | Title | h |
|----|-------|---|
| E1.F.1 | Mobile-responsive — bottom-sheet nav, post layout adapt | 4 |
| E1.F.2 | Theme toggle dark/light (premium light variant) | 2 |
| E1.F.3 | Error / loading / empty states | 3 |
| E1.F.4 | Accessibility — focus rings, ARIA, keyboard nav | 3 |

### Epic G — Deploy (~11h)

| ID | Title | h |
|----|-------|---|
| E1.G.1 | Production docker-compose + Caddy | 3 |
| E1.G.2 | Backup pipeline — pg_dump + restore-test | 2 |
| E1.G.3 | Monitoring — Sentry + Loki | 3 |
| E1.G.4 | Production deploy + DNS + TLS | 3 |

---

## Phase 2 — v1 · 1.5 months (~160h)

Parity with mircs/XenForo + modern UX. WebSocket, structured forms, achievements, Discord bot.

| Epic | h | Notes |
|------|---|-------|
| E2.A Structured forms (BanAppeal, PlayerReport, AdminApplication) | 30 | Workflow with statuses + linked discussion threads |
| E2.B WebSocket live (threads, presence, typing) | 20 | FastAPI WS + Redis pubsub |
| E2.C Personal Messages (1-1, group) | 25 | |
| E2.D Achievements (auto + manual) | 15 | 20 base medals seeded |
| E2.E Donation placeholder (МЕЦЕНАТ role) | 5 | Real payment in v3 |
| E2.F Web push notifications | 10 | |
| E2.G Discord bot (mirror, role-sync, slash) | 20 | discord.py |
| E2.H Editor v2 (drafts, mentions, bookmarks) | 10 | |
| E2.I Moderation v2 (warnings, mutes, IP-bans) | 15 | |
| E2.J Meilisearch | 10 | |

---

## Phase 3 — v2 · 2–3 months (~370h, killer features)

What no other CS forum has.

| Epic | h | Risk |
|------|---|------|
| E3.A CS-server live integration | 80 | Depends on AMX plugin & DB access |
| E3.B In-browser CS 1.6 demo player | 120 | R&D, may grow to 200h |
| E3.C AI moderation + RU↔EN auto-translate | 40 | Cost cap on Claude API |
| E3.D Player stat dashboards | 40 | Depends on E3.A |
| E3.E Twitch/YouTube live embeds | 20 | Trivial |
| E3.F Reputation v2 + antifraud | 30 | Needs ≥3 months of usage data |
| E3.G Public API + PWA + offline | 40 | |

---

## Status (live)

- **Current**: Phase 0 complete. Ready to start E1.A.1.
- **Blockers**: none. (Steam API key not yet acquired — only blocks E1.A.2 specifically.)
- **Next milestone**: Phase 1 Epic A complete → can register / log in.
