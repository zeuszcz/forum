---
description: Ingested проектную документацию (docs/**, CLAUDE.md) в SecondBrain daily log
argument-hint: [--dry-run]
allowed-tools: Bash(uv:*)
---

Затянуть изменения markdown-документации CorporateMessanger в сегодняшний daily лог SecondBrain. Используется SHA-256 трекинг — повторные запуски ничего не делают, если файлы не менялись.

```bash
uv run --directory ./secondbrain python ./secondbrain/scripts/sync_project_docs.py $ARGUMENTS
```

После — короткий отчёт: список файлов и строк добавленных в daily log.
