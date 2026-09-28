# Duevia 0.5.0

A personal expense tracker built on a double-entry ledger, delivered as a
**REST API only**. The project provides:

- A FastAPI REST API (the sole interface -- there is no bundled CLI or UI)
- SQLite storage (WAL mode for concurrent request handling)
- Single-owner authentication with bcrypt password hashing, rate-limited login
  and password-reset endpoints
- Expense, income, refund, transfer, split, settlement, budget, and reporting
  features

> **Migrating from an older checkout?** Earlier versions shipped a
> `duevia` command-line interface (`duevia/presentation/cli.py`,
> `duevia/__main__.py`). CLI support has been dropped in favor of API-only
> access -- every capability the CLI had is available through the REST API
> documented in [`docs/API_README.md`](docs/API_README.md). There is no data
> migration needed: the CLI and API always shared the same SQLite database
> and application layer.

## Requirements

- Python 3.10 or newer
- `pip`

## Installation

### 1. Clone the project and open its directory

```bash
git clone <repository-url>
cd <repository-directory>
```

### 2. Create a virtual environment

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Windows PowerShell:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## Configuration

All configuration is via environment variables (see `duevia/config.py`):

| Variable | Default | Purpose |
|---|---|---|
| `DUEVIA_DB_PATH` | `~/.duevia_0.5/expense.db` | SQLite file path |
| `DUEVIA_CORS_ORIGINS` | *(empty -- no origins allowed)* | Comma-separated list of allowed browser origins, or `*` for a public read-mostly API (credentials are automatically disabled when `*` is used, since browsers reject wildcard-origin + credentials) |
| `DUEVIA_ENV` | `production` | `production` or `development`; controls safe defaults like whether API docs are exposed |
| `DUEVIA_ENABLE_DOCS` | *(unset, follows `DUEVIA_ENV`)* | `true`/`false` to force Swagger UI (`/docs`), ReDoc (`/redoc`), and `/openapi.json` on or off regardless of environment |

For local development:

```bash
export DUEVIA_ENV=development
export DUEVIA_CORS_ORIGINS="http://localhost:8501,http://localhost:3000"
```

## Start the application

```bash
export PYTHONPATH="$PWD"
python -m uvicorn duevia.presentation.api.app:app --reload --port 8000
```

The server is now available at:

- Application: <http://localhost:8000>
- Health check: <http://localhost:8000/health> (also verifies DB connectivity)
- Swagger UI: <http://localhost:8000/docs> (development only by default -- see Configuration above)
- OpenAPI schema: <http://localhost:8000/openapi.json>

## Create the first owner

The first setup request creates the owner account and returns an access token:

```bash
curl -X POST http://localhost:8000/api/v0.5/setup/init \
  -H "Content-Type: application/json" \
  -d '{
    "name": "You",
    "email": "you@example.com",
    "currency": "INR",
    "timezone": "Asia/Kolkata",
    "password": "at least 8 characters",
    "security_question_id": 1,
    "security_answer": "Whiskers"
  }'
```

See [`docs/API_README.md`](docs/API_README.md) for the full endpoint map,
authentication flow, and error contract, and
[`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md) for the system
design.

## Production readiness notes

- **CORS**: set `DUEVIA_CORS_ORIGINS` explicitly to the origins that should be
  allowed to call this API from a browser. Leaving it unset blocks all
  browser origins (server-to-server / same-origin calls are unaffected).
- **API docs**: `/docs`, `/redoc`, and `/openapi.json` are disabled by default
  unless `DUEVIA_ENV=development` or `DUEVIA_ENABLE_DOCS=true` is set --
  avoids exposing your full API surface publicly by accident.
- **Rate limiting**: `/auth/login`, `/auth/security-question`, and
  `/auth/reset-password` are rate-limited per client IP in-process. This is a
  basic safety net for a single-instance deployment; a multi-instance
  deployment should also rate-limit at the edge (reverse proxy / gateway).
- **Reverse proxy**: run behind a TLS-terminating reverse proxy in production;
  the app emits HSTS and baseline security headers when `DUEVIA_ENV=production`.
- **Database**: SQLite runs in WAL mode for better concurrent read/write
  behavior under API traffic. For heavier multi-user workloads, consider
  migrating to a server-based database -- the repository layer
  (`duevia/infrastructure/repositories.py`) is the only place that would need
  to change.

## Stop the application

Press `Ctrl+C` in the terminal running Uvicorn.
