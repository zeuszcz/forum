# endless-war SecondBrain

Repo-local knowledge base for the forum. Inspired by Karpathy's LLM wiki +
claude-memory-compiler.

## Quick start

```bash
# Compile changed daily logs
uv run --directory ./secondbrain python ./secondbrain/scripts/compile.py

# Ask the wiki
uv run --directory ./secondbrain python ./secondbrain/scripts/query.py \
    "how does shoutbox handle system events?" --file-back

# Health check
uv run --directory ./secondbrain python ./secondbrain/scripts/lint.py
```

See [AGENTS.md](AGENTS.md) for the contract.
