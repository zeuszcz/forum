---
description: Спросить SecondBrain (index-guided, без RAG). Пример `/sb-query как работает renegotiation в звонках`
argument-hint: [question]
allowed-tools: Bash(uv:*)
---

Ответь на вопрос **из SecondBrain**, а не из случайного сканирования кода.

1. Прочитай `secondbrain/knowledge/index.md` чтобы найти 3–10 релевантных статей.
2. Прочитай эти статьи целиком.
3. Если вопрос серьёзный (требует синтеза) — используй CLI:
   ```bash
   uv run --directory ./secondbrain python ./secondbrain/scripts/query.py "$ARGUMENTS" --file-back
   ```
   Флаг `--file-back` сохранит ответ в `secondbrain/knowledge/qa/`, чтобы следующие сессии не пересинтезировали.
4. Если вопрос простой — ответь сразу по статьям с `[[wikilink]]` цитатами.
5. Заверши одним абзацем рекомендации + список консультированных статей.

**Важно:** не сканируй код до того как прочитал релевантные статьи в wiki.
