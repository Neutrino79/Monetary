# Monetary

[![CI](https://github.com/Neutrino79/duevia-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/Neutrino79/duevia-ledger/actions/workflows/ci.yml)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red.svg)](LICENSE)
![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)
![Node 22](https://img.shields.io/badge/node-22-green)

A personal expense tracker built on a double-entry ledger. Track expenses, income, refunds and transfers,
split bills with friends and settle up, set budgets, and see where your money goes.

- **Backend** (`monetary/`) -- a FastAPI REST API over SQLite. It owns *all* ledger logic: balances,
  net worth, budgets, friend balances, reports, filtering and paging.
- **Web app** (`web/`) -- a React + TypeScript single-page app that displays what the API computes and
  sends the user's intent. See [`web/README.md`](web/README.md).

Single-owner authentication uses bcrypt password hashing, with rate-limited login and password reset.

**Contents:** [Quick start](#quick-start) · [Repository layout](#repository-layout) ·
[Configuration](#configuration) · [Database](#database) · [Testing and checks](#testing-and-checks) ·
[Developer tooling](#developer-tooling) · [Production notes](#production-notes) ·
[Contributing](#contributing) · [License](#license)

## Quick start

Requirements: Python 3.10+ with `pip`, and Node.js 22 with npm (web app only).

**One command** (macOS/Linux, or Git Bash/WSL on Windows):

```bash
./scripts/dev.sh            # API on :8000 + web app on :5173; Ctrl+C stops both
./scripts/dev.sh backend    # only the API
./scripts/dev.sh web        # only the web app
```

On first run it creates `.venv`, installs backend and web dependencies, and creates `web/.env.local`; later
runs reinstall only when `requirements*.txt` or `web/package-lock.json` change. In VS Code, run the task
**Dev: start API + web** (`Cmd/Ctrl+Shift+P` → *Tasks: Run Task*, or *Tasks: Run Build Task*) to get the two
servers in two side-by-side terminals. Override ports with `BACKEND_PORT` / `WEB_PORT`.

Prefer to do it by hand? Same thing, step by step:

```bash
# 1. Backend -> http://localhost:8000
python3 -m venv .venv && source .venv/bin/activate        # Windows: py -m venv .venv; .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
export MONETARY_ENV=development MONETARY_CORS_ORIGINS=http://localhost:5173
python -m uvicorn monetary.presentation.api.app:app --reload --port 8000

# 2. Web app -> http://localhost:5173   (second terminal)
cd web
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
`http://localhost:8000/docs` and `/openapi.json` (development only by default). Full endpoint map, auth
flow and error contract: [`docs/API.md`](docs/API.md).

## Repository layout

```text
monetary/                  Backend package
  config.py                  Product identity and every environment variable (single source of truth)
  seed_defaults.json         Default categories / income sources created at first-run setup
  domain/                    Money, ledger invariants, enums, exceptions, hashing -- no DB or HTTP
  application/               Services (use cases), posting strategies, edit policies
  infrastructure/            SQLite schema + connection, repositories, rate limiter
  presentation/api/          FastAPI app, routers, request/response schemas, error handling
tests/                     Backend tests: unit/ (pure), service/ (real temp SQLite), api/ (HTTP TestClient)
web/                       Web app -- a self-contained npm project with its own README and tooling
docs/                      API reference, architecture, SQLite schema, integration record
scripts/dev.sh             One-command local development (API + web)
scripts/check.sh           One-command backend validation
.github/                   CI workflow, Dependabot config, pull-request template
.vscode/                   Shared VS Code tasks and extension recommendations
.env.example               Backend configuration template
.pre-commit-config.yaml    Git hooks (see Developer tooling)
ruff.toml  pytest.ini  .coveragerc  requirements.txt  requirements-dev.txt  .editorconfig
```

Dependencies point one way: `presentation → application → infrastructure → domain`
(`application` also uses `infrastructure.repositories`; `domain` imports nothing from the project).
Routers translate HTTP to service calls and map results to response schemas; business rules live in
`application/` and `domain/`; all SQL lives in `infrastructure/`. More in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Configuration

The backend is configured only through environment variables (defined in `monetary/config.py`;
template in [`.env.example`](.env.example) -- the app does not load that file itself).

| Variable | Default | Purpose |
|---|---|---|
| `MONETARY_ENV` | `production` | `production` or `development`. Production hides API docs and sends HSTS + security headers |
| `MONETARY_CORS_ORIGINS` | *(empty -- no origins)* | Comma-separated browser origins allowed to call the API; `*` allows all but disables credentials |
| `MONETARY_DB_PATH` | `~/.monetary_0.5/monetary.db` | SQLite file path |
| `MONETARY_ENABLE_DOCS` | *(follows `MONETARY_ENV`)* | `true`/`false` forces `/docs`, `/redoc`, `/openapi.json` on or off |
| `MONETARY_APP_NAME` | `Monetary` | Product name served by `GET /meta` and shown by the web app |
| `MONETARY_APP_TAGLINE` | `Personal expense ledger` | Tagline served by `GET /meta` |
| `MONETARY_SEED_DEFAULTS_PATH` | bundled `monetary/seed_defaults.json` | Replace the default categories / income sources |

The web app's own settings (`VITE_*`) are documented in [`web/.env.example`](web/.env.example).

## Database

SQLite in WAL mode. The schema is created automatically on first connection by
`monetary/infrastructure/db.py` (reference copy: [`docs/LIVE_SCHEMA.sql`](docs/LIVE_SCHEMA.sql)), and the
first `POST /setup/init` seeds the defaults.

> **There is no migration framework.** The schema is edited in place, so a database created by an older
> release must be deleted and re-created. The default location is `~/.monetary_0.5/monetary.db`; the
> directory name carries the schema generation. Back up the file before upgrading anything you care about.

## Testing and checks

```bash
# Backend (repo root, venv active, dev tools: python -m pip install -r requirements-dev.txt)
python -m pytest                    # unit + service + api + config tests
./scripts/check.sh                  # compile check + app import + full suite with coverage
./scripts/check.sh fast             # skip the slower subprocess-based config tests
./scripts/check.sh live             # also boots a real server and curls /health
ruff check .                        # lint (unused/undefined names)

# Web app (from web/)
npm run typecheck                   # tsc -b --noEmit
npm run lint                        # oxlint
npm test                            # unit + UI tests with a stubbed network
npm run build                       # type-check + production bundle into dist/
npm run test:integration            # real React app -> real uvicorn -> temp SQLite (needs the backend's pip deps)
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same commands on every push to `main`
and every pull request.

## Developer tooling

- **Git hooks** ([pre-commit](https://pre-commit.com)): after `python -m pip install -r requirements-dev.txt`
  and `npm ci` in `web/`, run `pre-commit install` once. Every commit then runs YAML/JSON validation,
  merge-conflict and private-key detection, a large-file guard, `ruff` on Python and `oxlint` on `web/`.
  Run them on demand with `pre-commit run --all-files`.
- **Dev servers**: `./scripts/dev.sh` and the VS Code tasks in `.vscode/tasks.json` (see Quick start);
  `.vscode/extensions.json` recommends the Python, Ruff, Oxc and EditorConfig extensions.
- **Editor settings**: [`.editorconfig`](.editorconfig) sets UTF-8, LF line endings, a final newline and
  indentation (4 spaces for Python, 2 elsewhere); most editors honour it automatically.
- **Dependency updates**: Dependabot opens grouped weekly PRs for pip (`/`), npm (`/web`) and GitHub Actions.

## Production notes

- **TLS and proxy**: run behind a TLS-terminating reverse proxy; start uvicorn with `--proxy-headers` so the
  rate limiter sees real client IPs.
- **CORS**: set `MONETARY_CORS_ORIGINS` to the web app's origin. Unset blocks every browser origin.
- **Rate limiting** is in-process (login, security-question, password-reset): fine for one instance;
  with several instances also rate-limit at the edge.
- **SQLite** suits a single instance. Moving to a server database would only change
  `monetary/infrastructure/` (`db.py`, `repositories.py`, `transaction_queries.py`).
- **Web app**: a static bundle (`npm run build` → `web/dist/`); set `VITE_API_BASE_URL` at build time.
  The repo carries SPA-rewrite files for Vercel (`vercel.json`) and Netlify-style hosts
  (`public/_redirects`). There is no Dockerfile or deployment pipeline in this repository.

## Contributing

1. Branch from `main`; keep backend changes inside the layer that owns them (see layout above).
2. Add tests next to the matching layer in `tests/` (`unit`, `service`, `api`); `tests/sample_data.py` is the
   shared dataset all layers use.
3. Install the git hooks (above), and before opening a PR run `./scripts/check.sh` plus, for web changes,
   `npm run typecheck && npm run lint && npm test && npm run build` in `web/`.
4. Changing the API contract means updating `web/src/lib/api/` (services, mappers, `types/api.ts`) and
   [`docs/API.md`](docs/API.md) in the same change.
5. Open a PR; the template lists what reviewers will look for.

See also: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (system design) and
[`docs/INTEGRATION_CHECKLIST.md`](docs/INTEGRATION_CHECKLIST.md) (record of the web-app ⇄ backend integration).

## License

Proprietary and confidential. © 2026 Atharv Hiremath, all rights reserved -- see [LICENSE](LICENSE).
This is a private repository; no permission to use, copy or distribute the code is granted.
