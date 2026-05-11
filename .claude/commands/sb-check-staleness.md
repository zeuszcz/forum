---
description: Найти concept/connection статьи в wiki чьи source файлы существенно изменились с момента updated:
argument-hint: [--hot-threshold 20] [--cold-threshold 50] [--since-days 7]
allowed-tools: Bash(uv:*), Read
---

Запусти staleness-сканер SecondBrain.

**Как работает:**
- Для каждой статьи в `secondbrain/knowledge/concepts/` и `connections/` парсит frontmatter (`updated:` + `sources:`).
- Для каждого source path — `git log --since="<updated>" -- <path>` и считает количество коммитов.
- Hot-path (hooks/, stores/, services/, routers/, crypto/, utils/calls/, components/, main.py) — threshold 20.
- Cold-path — threshold 50.
- Flag'ит статьи где хотя бы один source превысил threshold.

```bash
uv run --directory ./secondbrain python ./secondbrain/scripts/check_staleness.py $ARGUMENTS
```

Затем:
1. Прочитай последний `secondbrain/reports/staleness-YYYY-MM-DD.md`.
2. Выведи markdown-таблицу с топ-5 самых устаревших.
3. Для топ-3 — предложи конкретный план refresh (что добавить в «## Update YYYY-MM-DD» секцию).

**Флаги:**
- `--hot-threshold N` — переопределить для hot files (default 20)
- `--cold-threshold N` — переопределить для cold files (default 50)
- `--since-days N` — пропустить статьи свежее N дней

Не предлагай refresh трогающий >5 статей за один заход — discipline по ceiling (45 concepts max).
