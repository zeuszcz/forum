---
description: Health-check SecondBrain wiki (7 проверок) — broken links, orphans, stale, contradictions
argument-hint: [--structural-only]
allowed-tools: Bash(uv:*), Read
---

Запусти lint SecondBrain. Семь проверок:

1. **Broken links** — `[[wikilinks]]` на несуществующие статьи
2. **Orphan pages** — статьи без входящих ссылок
3. **Orphan sources** — daily логи ещё не скомпилированные
4. **Stale articles** — источник изменился после последней компиляции
5. **Missing backlinks** — A ссылается на B, но B не ссылается обратно
6. **Sparse articles** — <200 слов, вероятно незавершены
7. **Contradictions** — противоречия (LLM, платно; отключить `--structural-only`)

```bash
uv run --directory ./secondbrain python ./secondbrain/scripts/lint.py $ARGUMENTS
```

Затем прочитай последний `secondbrain/reports/lint-YYYY-MM-DD.md` и выведи короткий summary по секциям с указанием количества проблем и первых 3 примеров.
