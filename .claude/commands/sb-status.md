---
description: Обзор состояния SecondBrain — размер wiki, последний compile, untracked logs
allowed-tools: Bash, Read
---

Выведи one-glance отчёт о состоянии SecondBrain.

Параллельно собери:

1. `ls secondbrain/daily/*.md | wc -l` — количество daily логов
2. `ls secondbrain/knowledge/concepts/*.md | wc -l` — концепты
3. `ls secondbrain/knowledge/qa/*.md | wc -l` — Q&A
4. `ls secondbrain/knowledge/connections/*.md | wc -l` — связи
5. Прочитай `secondbrain/scripts/state.json` (если есть) — последний compile, total cost, query count
6. Прочитай последние 10 строк `secondbrain/knowledge/log.md` — свежая активность
7. Прочитай `secondbrain/scripts/memory-state.json` (если есть) — хэши memory-файлов
8. Прочитай `secondbrain/scripts/last-memory-sync.json` (если есть) — дата последнего session-start sync

Выведи markdown-таблицу "Что / Сколько / Последний раз" + свежие 5 событий из log.md.
