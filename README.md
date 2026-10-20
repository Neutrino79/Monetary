# Monetary 0.5.0

A personal expense tracker built on a double-entry ledger.

- **Backend** (`monetary/`) -- a FastAPI REST API over SQLite. It owns *all* ledger logic: balances,
  net worth, budgets, friend balances, reports, filtering and paging.
- **Web app** (`production-app/`) -- a React + TypeScript single-page app that displays what the API
  computes and sends the user's intent. See [`production-app/README.md`](production-app/README.md).

Features: single-owner authentication (bcrypt, rate-limited login and password reset), expenses, income,
refunds, transfers, splits and settlements with friends, budgets, and reports.

> **Naming.** The project was formerly called *Duevia*. The Python package, the environment variables and
> the docs now say *Monetary*. A few identifiers keep their old spelling **on purpose**, because they are
> persisted or external: the default database path (`~/.duevia_0.5/expense.db`), the old `DUEVIA_*`
> environment variables (still honoured as a fallback), and this repository's GitHub slug
> (`duevia-ledger`). See [Configuration](#configuration) and
> [`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md#12-project-naming).

## Repository layout

```text
monetary/                 Backend package
  config.py                 Product identity and every environment variable (single source of truth)
  seed_defaults.json        Default categories / income sources created at first-run setup
  domain/                   Money, ledger invariants, enums, exceptions, hashing -- no DB or HTTP
  application/              Services (use cases), posting strategies, edit policies
  infrastructure/           SQLite schema + connection, repositories, rate limiter
  presentation/api/         FastAPI app, routers, request/response schemas, error handling
tests/                    Backend tests: unit/ (pure), service/ (real temp SQLite), api/ (HTTP TestClient)
production-app/          Web app -- a self-contained npm project with its own README and tooling
docs/                     API reference, architecture, SQLite schema, integration record
scripts/check.sh          One-command backend validation
.github/workflows/ci.yml  CI: backend tests, frontend typecheck/lint/test/build, live integration suite
.env.example              Backend configuration template
pytest.ini  .coveragerc  requirements.txt  requirements-dev.txt
```

Dependencies point one way: `presentation → application → infrastructure → domain`
(`application` also uses `infrastructure.repositories`; `domain` imports nothing from the project).
Routers translate HTTP to service calls and map results to response schemas; business rules live in
`application/` and `domain/`; all SQL lives in `infrastructure/`.

## Requirements

- Python 3.10 or newer, and `pip`
- Node.js 22 and npm (for the web app only)

## Run it locally

```bash
# 1. Backend -> http://localhost:8000
python3 -m venv .venv && source .venv/bin/activate        # Windows: py -m venv .venv; .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
export MONETARY_ENV=development MONETARY_CORS_ORIGINS=http://localhost:5173
python -m uvicorn monetary.presentation.api.app:app --reload --port 8000

# 2. Web app -> http://localhost:5173   (in a second terminal)
cd production-app
npm ci
cp .env.example .env.local        # VITE_API_BASE_URL defaults to http://localhost:8000/api/v0.5
npm run dev
```

The first visit shows a one-time setup screen that creates the single owner and seeds the default
categories and income sources. The same can be done over HTTP:

```bash
curl -X POST http://localhost:8000/api/v0.5/setup/init -H "Content-Type: application/json" -d '{
  "name": "You", "email": "you@example.com", "currency": "INR", "timezone": "Asia/Kolkata",
  "password": "at least 8 characters", "security_question_id": 1, "security_answer": "Whiskers"}'
```

Useful URLs: health check `http://localhost:8000/health` (also verifies DB connectivity); Swagger UI
`http://localhost:8000/docs` and the OpenAPI schema `/openapi.json` (development only by default).
Stop the server with `Ctrl+C`. Full endpoint map, auth flow and error contract:
[`docs/API_README.md`](docs/API_README.md).

## Configuration

The backend is configured only through environment variables (defined in `monetary/config.py`;
template in [`.env.example`](.env.example) -- the app does not load that file itself).

| Variable | Default | Purpose |
|---|---|---|
| `MONETARY_ENV` | `production` | `production` or `development`. Production hides API docs and sends HSTS + security headers |
| `MONETARY_CORS_ORIGINS` | *(empty -- no origins)* | Comma-separated browser origins allowed to call the API; `*` allows all but disables credentials |
| `MONETARY_DB_PATH` | `~/.duevia_0.5/expense.db` | SQLite file path |
| `MONETARY_ENABLE_DOCS` | *(follows `MONETARY_ENV`)* | `true`/`false` forces `/docs`, `/redoc`, `/openapi.json` on or off |
| `MONETARY_APP_NAME` | `Monetary` | Product name served by `GET /meta` and shown by the web app |
| `MONETARY_APP_TAGLINE` | `Personal expense ledger` | Tagline served by `GET /meta` |
| `MONETARY_SEED_DEFAULTS_PATH` | bundled `monetary/seed_defaults.json` | Replace the default categories / income sources |

Each variable's old `DUEVIA_*` spelling (e.g. `DUEVIA_DB_PATH`) is still read when the `MONETARY_*` one is
unset, so existing deployments keep working; `MONETARY_*` wins if both are set. Use the new names in new
configuration. The web app's own settings (`VITE_*`) are documented in
[`production-app/.env.example`](production-app/.env.example).

## Database

SQLite in WAL mode. The schema is created automatically on first connection by
`monetary/infrastructure/db.py` (reference copy: [`docs/LIVE_SCHEMA.sql`](docs/LIVE_SCHEMA.sql)); the first
`POST /setup/init` seeds the defaults. **There is no migration framework**: the schema is edited in place, so a
database created by an older release must be deleted and re-created (default location
`~/.duevia_0.5/expense.db`). Back up the file before upgrading anything you care about.

## Test and check

```bash
# Backend (from the repo root, venv active; dev tools: python -m pip install -r requirements-dev.txt)
python -m pytest                    # unit + service + api + config tests
./scripts/check.sh                  # compile check + app import + full suite with coverage
./scripts/check.sh fast             # skip the slower subprocess-based config tests
./scripts/check.sh live             # also boots a real server and curls /health

# Web app (from production-app/)
npm run typecheck                   # tsc -b --noEmit
npm run lint                        # oxlint
npm test                            # unit + UI tests with a stubbed network
npm run build                       # type-check + production bundle into dist/
npm run test:integration            # real React app -> real uvicorn -> temp SQLite (needs the backend's pip deps)
```

The backend has no linter or type-checker configured; CI runs the same commands as above.

## Production notes

- **TLS and proxy**: run behind a TLS-terminating reverse proxy; start uvicorn with `--proxy-headers` so the
  rate limiter sees real client IPs.
- **CORS**: set `MONETARY_CORS_ORIGINS` to the web app's origin. Unset blocks every browser origin.
- **Rate limiting** is in-process (login, security-question, password-reset): fine for one instance;
  with several instances also rate-limit at the edge.
- **SQLite** suits a single instance. Moving to a server database would only change
  `monetary/infrastructure/` (`db.py`, `repositories.py`, `transaction_queries.py`).
- **Web app**: a static bundle (`npm run build` → `production-app/dist/`); set `VITE_API_BASE_URL` at build
  time. The repo carries SPA-rewrite files for Vercel (`vercel.json`) and Netlify-style hosts
  (`public/_redirects`). There is no Dockerfile or deployment pipeline in this repository.

## Contributing

1. Branch from `main`; keep backend changes inside the layer that owns them (see layout above).
2. Add tests next to the matching layer in `tests/` (`unit`, `service`, `api`); `tests/sample_data.py` is the
   shared dataset all layers use.
3. Run `./scripts/check.sh` and, for web changes, `npm run typecheck && npm run lint && npm test && npm run build`
   in `production-app/` before opening a PR.
4. Changing the API contract means updating `production-app/src/lib/api/` (services, mappers, `types/api.ts`) and
   [`docs/API_README.md`](docs/API_README.md) in the same change.

See also: [`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md) (system design) and
[`docs/INTEGRATION_CHECKLIST.md`](docs/INTEGRATION_CHECKLIST.md) (record of the web-app ⇄ backend integration).
