# Team onboarding

1) Install dependencies:

```bash
cd secondbrain
uv sync
python scripts/init_workspace.py
```

2) Ensure project hooks are enabled from `.cursor/hooks.json`.

3) Optional backend setup:

- Cursor backend (default): set `SECOND_BRAIN_LLM_BACKEND=cursor`
- Claude backend: set `SECOND_BRAIN_LLM_BACKEND=claude`
- Deterministic/no-LLM mode: set `SECOND_BRAIN_LLM_BACKEND=none`
- On Windows, install standalone Cursor Agent CLI if needed:
  `irm 'https://cursor.com/install?win32=true' | iex`
- Then authenticate once: `agent login` (or set `CURSOR_API_KEY`)

4) Quick checks:

```bash
uv run python scripts/check_sdk.py
uv run python scripts/sync_project_docs.py --dry-run
uv run python scripts/compile.py --dry-run
uv run python scripts/lint.py --structural-only
```

5) Raw/web ingest (external articles):

```bash
uv run python scripts/ingest_web.py "https://example.com/article"
```

6) Nightly maintenance (after configured hour, once per day):

```bash
uv run python scripts/maintenance.py
```

