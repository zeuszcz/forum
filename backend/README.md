# endless-war — backend

FastAPI service. Async SQLAlchemy 2 over PostgreSQL. JWT auth (Steam OpenID + email).

## Local (without Docker)

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Requires Postgres + Redis running locally (or use Docker for those: `docker compose up -d postgres redis`).

## Migrations

```bash
# create a new migration after model changes
alembic revision --autogenerate -m "describe change"

# apply
alembic upgrade head

# rollback one
alembic downgrade -1
```

## Tests

```bash
pytest                  # run all
pytest --cov=app        # with coverage
ruff check .            # lint
ruff format .           # format
mypy app                # type-check
```

## Layout

```
app/
├── core/          config, database, security, logging, deps
├── models/        SQLAlchemy ORM
├── schemas/       Pydantic DTOs
├── routers/       FastAPI endpoints
├── services/      Business logic
└── main.py        ASGI app entrypoint
alembic/           Migrations
tests/             pytest suites
```
