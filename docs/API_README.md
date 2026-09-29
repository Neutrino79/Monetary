# Duevia API

A REST API over a double-entry ledger engine, documented further in
`ARCHITECTURE_PLAN.md` and the project root `README.md`. **This is now the
only interface to Duevia** -- the previous CLI has been removed; every
capability it had (accounts, categories, transactions, splits, transfers,
settlements, reports) is available here.

## Run it

```bash
cd <repository-directory>
export PYTHONPATH="$PWD"
uvicorn duevia.presentation.api.app:app --reload --port 8000
```

Interactive docs (Swagger UI): `http://localhost:8000/docs`. OpenAPI schema:
`http://localhost:8000/openapi.json` -- point any codegen tool at this to
generate a typed client for whatever UI framework you use. **Docs are
disabled by default outside development** -- see Configuration below.

Config via environment variables (see `duevia/config.py`):
- `DUEVIA_DB_PATH` -- SQLite file path (default `~/.duevia_0.5/expense.db`)
- `DUEVIA_CORS_ORIGINS` -- comma-separated allowed browser origins (default:
  none allowed). `*` is accepted for a public API, but credentialed requests
  are then disabled automatically (wildcard origin + credentials is invalid
  per the CORS spec and rejected by browsers anyway).
- `DUEVIA_ENV` -- `production` (default) or `development`.
- `DUEVIA_ENABLE_DOCS` -- force `/docs`, `/redoc`, `/openapi.json` on/off.

## Authentication

Single-owner email + password login, with security-question-based password recovery.

**Bootstrap once** (also logs you in immediately -- the response includes a token):

```bash
curl -X POST http://localhost:8000/api/v0.5/setup/init \
  -H "Content-Type: application/json" \
  -d '{
        "name": "You", "email": "you@example.com", "currency": "INR", "timezone": "Asia/Kolkata",
        "password": "at least 8 characters",
        "security_question_id": 1, "security_answer": "Whiskers"
      }'
```

`GET /api/v0.5/auth/security-questions` lists the fixed set of 5 questions (id + text) so a signup
form can render a dropdown for `security_question_id`.

**Log in later** (form-encoded, standard OAuth2 password flow -- `username` is your email):

```bash
curl -X POST http://localhost:8000/api/v0.5/auth/login -d "username=you@example.com&password=..."
```

Returns `{"access_token": "...", "token_type": "bearer"}`. Every other endpoint requires it:
`Authorization: Bearer <access_token>`. Sessions last 7 days; `POST /api/v0.5/auth/logout`
invalidates the current one early.

This endpoint is rate-limited per client IP (10 attempts / 5 minutes by
default) to slow down credential-stuffing attempts; further attempts get a
`429 Too Many Requests`.

**In Swagger UI (`/docs`, development only by default):** click **Authorize**
(top right), enter your email as "username" and your password, and every "Try
it out" call attaches the token automatically.

**Forgot your password:**
```bash
curl "http://localhost:8000/api/v0.5/auth/security-question?email=you@example.com"
# -> {"security_question_id": 1, "question": "What was the name of your first pet?"}

curl -X POST http://localhost:8000/api/v0.5/auth/reset-password -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "security_answer": "Whiskers", "new_password": "a new one"}'
```
Both of these are also rate-limited per client IP. A correct reset (or
`POST /api/v0.5/auth/change-password`) invalidates every existing session,
forcing a fresh login everywhere.

Passwords are hashed with bcrypt (max 128 chars accepted -- bcrypt itself
ignores anything past 72 bytes, so input is capped with a clear error rather
than silently truncated); security answers are normalized (trimmed,
lowercased) and hashed the same way -- nothing is ever stored in plaintext.
Session tokens are random, SHA-256 hashed at rest, and expire after 7 days.

## Error contract

Every error response is `{"detail": "human-readable message", "error_type": "ValidationError"}`.
`error_type` matches one of the domain exception names, so a UI can branch on it without parsing
the message string:

| `error_type` | HTTP status | Meaning |
|---|---|---|
| `NotFoundError` | 404 | Referenced id doesn't exist |
| `ValidationError` | 422 | Input violates a domain rule (currency mismatch, bad enum, etc.) |
| `MoneyError` | 422 | Malformed amount |
| `OwnershipError` | 403 | (not currently reachable in single-owner scope, reserved) |
| `ConflictError` | 409 | Valid input, but conflicts with current state (over-refund, settlement-history guard, etc.) |
| `RateLimitError` | 429 | Too many attempts against a rate-limited endpoint |
| `InternalError` | 500 | An unexpected server-side error. The response never includes the raw exception or a traceback; details are logged server-side only |
| anything else | 400 | Fallback |

FastAPI's own request-validation errors (missing required field, wrong type) return its standard
422 shape separately, before any of our code runs.

## Endpoint map

All routes are under `/api/v0.5`. Full detail is in `/docs` (when enabled); this is the shape:

| Resource | Routes |
|---|---|
| `setup` | `POST /setup/init` -- the one unauthenticated endpoint (creates the owner + logs them in) |
| `auth` | `GET /auth/security-questions`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/security-question`, `POST /auth/reset-password` |
| `owner` | `GET /owner`, `PATCH /owner` |
| `accounts` | `POST /accounts`, `GET /accounts`, `GET /accounts/{id}/balance`, `POST /accounts/{id}/deactivate` |
| `categories` | `POST /categories`, `GET /categories`, `POST /categories/{id}/deactivate` |
| `friends` | `POST /friends`, `GET /friends`, `PATCH /friends/{id}`, `DELETE /friends/{id}`, `GET /friends/balances`, `GET /friends/{id}/statement` |
| `transactions` | `POST /transactions/{expense,income,refund,adjustment}`, `GET /transactions` (paginated, filterable, searchable), `GET/PATCH/DELETE /transactions/{id}` |
| `splits` | `POST /splits`, `POST /splits/fronted`, `GET /splits`, `GET/PATCH/DELETE /splits/{id}` |
| `transfers` | `POST /transfers`, `GET /transfers`, `PATCH/DELETE /transfers/{id}` |
| `settlements` | `POST /settlements`, `GET /settlements`, `PATCH/DELETE /settlements/{id}` |
| `reports` | `GET /reports/{balance,budget,net-worth,spending,income,dashboard}` |
| `reports` (UI-oriented) | `GET /reports/reference-data`, `GET /reports/trends/{net-worth,spending,cashflow}` |
| `system` | `GET /health` (liveness + DB connectivity), `GET /` (service info) |

- **`GET /reports/reference-data`** -- accounts + categories + friends in one call, for populating
  a form's dropdowns without three round trips.
- **`GET /reports/trends/net-worth`, `/trends/spending`, `/trends/cashflow`** -- monthly time
  series for the last N months, exactly what a dashboard chart needs.
- **`GET /transactions?search=...`** -- full-text match on description/memo, with real
  `limit`/`offset` pagination and a `{items, total, limit, offset}` envelope.
- **Split/fronted `DELETE` takes `?force=true` / `?remove_settlements=true`** query params
  (not a body -- DELETE-with-body is non-standard and some HTTP clients/proxies mishandle it).

## What's enforced at the API boundary

- **CORS**: no browser origin is allowed until `DUEVIA_CORS_ORIGINS` is set (see Configuration).
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` on every
  response; `Strict-Transport-Security` when `DUEVIA_ENV=production` (put a TLS-terminating proxy
  in front in that case).
- **Docs exposure**: `/docs`, `/redoc`, `/openapi.json` are only served when explicitly enabled
  (development environment, or `DUEVIA_ENABLE_DOCS=true`).
- **Unhandled errors** never leak exception text or stack traces to the client; they're logged
  server-side and returned as a generic `500 InternalError`.

## Testing

`./scripts/check.sh` runs the full test suite (unit + service + API-level,
~395 tests) plus coverage. See
[`ROADMAP_AND_KNOWN_ISSUES.md`](ROADMAP_AND_KNOWN_ISSUES.md) for the
testing guide, the shared sample dataset, known issues, and remaining work.

## What stayed identical

Every validation rule, every posting strategy, the `STRICT`/`DIRECT` edit-policy dispatch, the
currency cross-checks, the transfer safety rails, the FIFO settlement labeling -- all unchanged,
because none of it lives in the API layer. The routers only translate HTTP calls into
application-service calls; the domain and application layers have no idea whether they're being
called from a socket or (previously) a terminal, which is the entire point of having kept them
separate from day one.
