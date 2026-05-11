---
description: Скомпилировать daily логи SecondBrain в knowledge articles
argument-hint: [--all | --file YYYY-MM-DD.md]
allowed-tools: Bash(uv:*)
---

Запусти компилятор SecondBrain: превратить новые daily логи в concept / connection articles.

```bash
uv run --directory ./secondbrain python ./secondbrain/scripts/compile.py $ARGUMENTS
```

По умолчанию компилируются только daily логи, изменившиеся с последней компиляции (сверка по SHA-256). Флаги:

- `--all` — форсировать полный rebuild
- `--file 2026-04-18.md` — скомпилировать один конкретный лог
- `--dry-run` — список без изменений

После компиляции — одной строкой отчитайся: сколько логов, сколько статей создано/обновлено, путь к обновлённому `secondbrain/knowledge/index.md`.
