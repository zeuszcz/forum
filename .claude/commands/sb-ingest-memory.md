---
description: Синхронизировать Claude Code auto-memory (MEMORY.md + feedback_*.md) в SecondBrain daily log
argument-hint: [--dry-run] [--force]
allowed-tools: Bash(uv:*)
---

Затянуть текущее состояние Claude Code постоянной памяти в сегодняшний daily лог SecondBrain.

**Как это работает:**
- Источник: `~/.claude/projects/<project-path-hash>/memory/*.md` (auto-derived, override через `CLAUDE_CODE_MEMORY_DIR`)
- SHA-256 хэши в `secondbrain/scripts/memory-state.json` определяют новое / изменённое
- Блок `### Memory Sync (HH:MM)` добавляется в `secondbrain/daily/YYYY-MM-DD.md`
- Компиляция в 18:00 или вручную — превратит изменённые memory в концепты wiki

```bash
uv run --directory ./secondbrain python ./secondbrain/scripts/sync_memory.py $ARGUMENTS
```

Флаги:
- `--dry-run` — показать что изменилось, без записи
- `--force` — переингестить всё независимо от хэшей
- `--memory-dir /path` — явный override

После запуска — отчитайся списком обновлённых memory файлов и путём к daily логу.
