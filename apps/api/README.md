# PQL Health API (apps/api)

## Setup

```powershell
cd apps/api
.venv\Scripts\python -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
.venv\Scripts\python -m uvicorn app.main:app --reload
```

## Database & migrations (Alembic)

- Schema is managed **only** by Alembic (`alembic.ini`, `alembic/`). `Base.metadata.create_all` is no longer used.
- The DB URL comes from app settings (`DATABASE_URL`, default `sqlite:///<repo>/apps/data/app.db`); `alembic/env.py` reads it and uses `render_as_batch=True` on SQLite.
- **On startup** the API runs `alembic upgrade head` (see `app/core/db.py::init_db`). Upgrading an up-to-date DB is a no-op, so it is safe to run repeatedly.
- Manual: `.venv\Scripts\python -m alembic upgrade head` (from `apps/api`).
- New migration: change `app/models/entities.py`, then `.venv\Scripts\python -m alembic revision --autogenerate -m "..."`.
- Legacy DBs created by the old `create_all` path (tables but no `alembic_version`) are stamped to head on startup; they will lack the new constraints, so delete the dev DB to get them.
- SQLite: every connection runs `PRAGMA foreign_keys=ON`; all FKs are `ON DELETE CASCADE`.

## Time

All datetimes are stored as **naive UTC** (`app/core/timeutil.py`: `utcnow()`, `parse_ts()` turns `...Z`/offset ISO into naive UTC). `silent_days` is floored whole days.

## Synthetic data

- `POST /api/v1/data/synthetic` loads `data/sample/customers.csv` + `events.csv` as `source=synthetic`, shifting each `occurred_at` by `now - generated_at_utc` (`seed_manifest.json`). Inserts are idempotent (unique `customers(tenant_id, external_id)` and `events(tenant_id, customer_id, event_type, occurred_at)`; duplicates skipped). Scores and stages are recomputed for the tenant.
- `DELETE /api/v1/data/synthetic` removes only `source=synthetic` customers; their events and scores cascade.
- Expected funnel: 72 / 60 / 36 / 12. Check with `python scripts/data/validate_seed.py --db <db> --tenant <id>`.
