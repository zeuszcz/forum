# CLAUDE.md — endless-war Forum Dev Rules

## 🔴 RULE #0 — Wiki-first (no exceptions except those listed)

**Any architecture / flow / module / regression / decision question — read `secondbrain/` FIRST, code SECOND.**

Procedure:
1. Check what `SessionStart` already injected (`project-context.md` + index + relevant concepts). Often the answer is already in your context.
2. If not — `Read secondbrain/knowledge/index.md` → 2-5 relevant articles → `/sb-query` to synthesise.
3. Code (`Read`, `Grep`) — only for **exact lines you are about to edit**, not for understanding.
4. After meaningful work — update the wiki (`/sb-compile` or a hand-written concept).

**Exceptions** (only these):
- User gave you a specific `file:line`.
- Debugging a stacktrace.
- Genuinely new area, nothing in `index.md` (then read code, but write a concept after).

**Path**: `secondbrain/` inside the repo. No external SecondBrain elsewhere.

---

## 🔴 RULE #0.5 — Post-prompt Wiki Gate

**After every prompt**, before `git push` / final answer — explicitly evaluate the gate.
Triggers that require a concept/log update:

- Architecture / re-architecture / new component
- Security model / policy (auth, RBAC, CSP, rate-limit)
- Caching / invalidation strategy
- Protocol / data-contract / pattern change (WS events, API schemas, envelope fields)
- Root-cause regression fix with a reusable lesson
- New operational rule / invariant

End your final response with **one of two lines**:

- `wiki: updated ([[path/to/article]])` — you wrote/updated a concept/connection/log
- `wiki: skip (trivial — no durable knowledge)` — prompt was a typo / rename / CSS copy / trivial UI text

Missing line = not done, do not merge.

### When triggered — 3 steps

1. Update or create a concept in `secondbrain/knowledge/`.
2. Update `index.md` if it is a new article.
3. Append to `log.md`: `## [YYYY-MM-DD] ingest | <topic>` + 1-3 bullets.

### Anti-noise

- Ceiling **45 concepts** — at ceiling, update existing rather than create new.
- Don't create a concept for every small fix. Only durable, reusable lessons.
- 3+ related concepts → write a `connection`, not a fourth concept.

---

## Development rules

1. **Read before editing.** Always read a file before you change it.
2. **Minimal changes.** Don't refactor what you weren't asked to. Don't add features alongside fixes.
3. **Shoutbox + WS is the critical zone** — single-worker `_Broadcaster` fanout, system-vs-user message split, polling fallback must merge. Be careful with anything touching:
    - `backend/app/services/shoutbox.py`
    - `backend/app/routers/shoutbox.py`
    - `frontend/src/components/forum/Shoutbox.tsx`
4. **Tokens are a resource.** Don't spend them on architectural plans instead of implementation. Read 2-4 files for a task, then write code.
5. **Conventional Commits** required: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`.
6. **Finish what you start** — start a prompt, drive it through commit + push + deploy. Plan token budget ahead.
7. **No duplication** — check for existing helpers before writing a new one (especially `frontend/src/lib/*` and `backend/app/services/*`).
8. **Security** — no SQL injection, XSS, command injection, or OWASP-top-10 holes. The shoutbox bot-cast endpoint is HMAC-only — never accept user JWT for `kind=system`.
9. **Parallel tool calls** — always call independent tools in parallel.

---

## Deploy

VPS: `ssh site-vps`. Repo: `/home/i48ptgvnis/forum/`.

```bash
ssh site-vps
cd ~/forum
git pull
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml build backend frontend
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend frontend
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head
```

nginx is on the host — never inside docker. TLS via certbot.

---

## SecondBrain (Persistent Wiki)

| Slot | Where |
|------|-------|
| Schema | `secondbrain/AGENTS.md` |
| Project context | `secondbrain/knowledge/project-context.md` (injected each session) |
| Concepts | `secondbrain/knowledge/concepts/*.md` |
| Connections | `secondbrain/knowledge/connections/*.md` |
| Daily logs | `secondbrain/daily/YYYY-MM-DD.md` |
| Hooks | `secondbrain/hooks/*.py` |
| Scripts | `secondbrain/scripts/*.py` |

Slash commands: `/sb-query`, `/sb-compile`, `/sb-lint`, `/sb-status`, `/sb-ingest-docs`, `/sb-ingest-memory`, `/sb-check-staleness`.

After substantial wiki edits — commit separately: `docs(secondbrain): …`.
