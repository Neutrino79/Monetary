# Monetary API

A REST API over a double-entry ledger engine, documented further in
`ARCHITECTURE.md` and the project root `README.md`. **This is now the
only interface to Monetary** -- the previous CLI has been removed; every
capability it had (accounts, categories, transactions, splits, transfers,
settlements, reports) is available here.

## Run it

```bash
cd <repository-directory>/backend
export PYTHONPATH="$PWD"
uvicorn monetary.presentation.api.app:app --reload --port 8000
```

Interactive docs (Swagger UI): `http://localhost:8000/docs`. OpenAPI schema:
`http://localhost:8000/openapi.json` -- point any codegen tool at this to
generate a typed client for whatever UI framework you use. **Docs are
disabled by default outside development** -- see Configuration below.

Config via environment variables (see `backend/monetary/config.py`):
- `MONETARY_DB_PATH` -- SQLite file path (default `~/.monetary_0.5/monetary.db`)
- `MONETARY_CORS_ORIGINS` -- comma-separated allowed browser origins (default:
  none allowed). `*` is accepted for a public API, but credentialed requests
  are then disabled automatically (wildcard origin + credentials is invalid
  per the CORS spec and rejected by browsers anyway).
- `MONETARY_ENV` -- `production` (default) or `development`.
- `MONETARY_ENABLE_DOCS` -- force `/docs`, `/redoc`, `/openapi.json` on/off.
- `MONETARY_APP_NAME` / `MONETARY_APP_TAGLINE` -- the user-facing product name and tagline (default
  `Monetary` / `Personal expense ledger`), served publicly by `GET /meta`.
- `MONETARY_SEED_DEFAULTS_PATH` -- optional JSON file replacing the default categories and income
  sources created at first-run setup (the bundled default is `backend/monetary/seed_defaults.json`).

## Wire format

- **camelCase JSON** for every request and response (`currencyCode`, `entryDate`). Requests also
  accept the snake_case spelling, so scripts written against earlier versions keep working.
  Two things deliberately keep their standard shape: the OAuth2 login response
  (`access_token`, `token_type`) and error bodies (`detail`, `error_type`).
- **Numeric ids.** Money is returned as `{ "points": 12345, "major": "INR 123.45", "currency": "INR" }`
  (`points` are 2-decimal minor units); amounts you *send* are decimal strings in major units
  (`"123.45"`) -- never floats.
- **Dates.** Transaction `date` is `YYYY-MM-DD` in the owner's timezone (stored as a UTC instant).
  List filters `dateFrom` / `dateTo` are both inclusive; future dates are rejected.
- **Query parameters** on the list endpoints are camelCase too (`accountId`, `dateFrom`, ...).
- **Partial updates.** On every `PATCH`, a key you omit is left alone and a key you send as `null`
  clears the field where that makes sense (a transaction's memo, a category's colour or budget,
  an account's credit limit, a friend's phone).

## Authentication

Single-owner email + password login, with security-question-based password recovery.

**Is the instance set up?** `GET /api/v0.5/setup/status` (public) returns `{"initialized": true|false}`.
A client can use it to choose between a first-run screen and a sign-in screen; `POST /setup/init` still
re-checks atomically and answers `409` if an owner already exists.

**Bootstrap once** (also logs you in immediately -- the response includes a token):

```bash
curl -X POST http://localhost:8000/api/v0.5/setup/init \
  -H "Content-Type: application/json" \
  -d '{
        "name": "You", "email": "you@example.com", "currency": "INR", "timezone": "Asia/Kolkata",
        "password": "at least 8 characters",
        "securityQuestionId": 1, "securityAnswer": "Whiskers"
      }'
```

Setup also creates the default expense categories and income sources (set `"seedDefaults": false`
to skip, or point `MONETARY_SEED_DEFAULTS_PATH` at your own list).

`GET /api/v0.5/auth/security-questions` lists the fixed set of 5 questions (id + text) so a signup
form can render a dropdown for `securityQuestionId`.

**Log in later** (form-encoded, standard OAuth2 password flow -- `username` is your email):

```bash
curl -X POST http://localhost:8000/api/v0.5/auth/login -d "username=you@example.com&password=..."
```

Returns `{"access_token": "...", "token_type": "bearer"}`. Wrong credentials answer `401` (with
`WWW-Authenticate: Bearer`). Every other endpoint requires the token:
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
# -> {"securityQuestionId": 1, "question": "What was the name of your first pet?"}

curl -X POST http://localhost:8000/api/v0.5/auth/reset-password -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "securityAnswer": "Whiskers", "newPassword": "a new one"}'
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
| `AuthenticationError` | 401 | Wrong email or password at login |
| `ValidationError` | 422 | Input violates a domain rule (currency mismatch, bad enum, etc.) |
| `MoneyError` | 422 | Malformed amount |
| `OwnershipError` | 403 | (not currently reachable in single-owner scope, reserved) |
| `ConflictError` | 409 | Valid input, but conflicts with current state (over-refund, settlement-history guard, etc.) |
| `RateLimitError` | 429 | Too many attempts against a rate-limited endpoint |
| `InternalError` | 500 | An unexpected server-side error. The response never includes the raw exception or a traceback; details are logged server-side only |
| anything else | 400 | Fallback |

FastAPI's own request-validation errors (missing required field, wrong type) return its standard
422 shape (`detail` is a list of `{loc, msg}` items) separately, before any of our code runs.

## Endpoint map

All routes are under `/api/v0.5`. Full detail is in `/docs` (when enabled); this is the shape:

| Resource | Routes |
|---|---|
| `system` | `GET /meta` (public: app name, tagline, version), `GET /health` (liveness + DB connectivity), `GET /` (service info) |
| `setup` | `GET /setup/status` (public), `POST /setup/init` -- the one-time owner creation that logs them in |
| `auth` | `GET /auth/security-questions`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/security-question`, `POST /auth/reset-password` |
| `owner` | `GET /owner`, `PATCH /owner` |
| `accounts` | `POST /accounts` (optional `openingBalance`, LIABILITY-only `creditLimit` / `statementDay`), `GET /accounts` (includes `balance`), `PATCH /accounts/{id}`, `GET /accounts/{id}/balance`, `POST /accounts/{id}/{deactivate,reactivate}` |
| `categories` | `POST /categories`, `GET /categories` (`?type=EXPENSE\|INCOME` -- income sources are INCOME categories), `PATCH /categories/{id}` (name, colour, budget, parent), `POST /categories/{id}/{deactivate,reactivate}` |
| `friends` | `POST /friends`, `GET /friends`, `PATCH /friends/{id}` (name, email, phone), `DELETE /friends/{id}`, `GET /friends/balances`, `GET /friends/{id}/statement` |
| `transactions` | **Flat API:** `POST /transactions` (one body for every type -- income, expense, transfer, split, fronted, settlement, refund, adjustment), `GET /transactions` (server-side filter / sort / group / paging), `GET /transactions/groups` (group headers), `GET/PATCH/DELETE /transactions/{id}`, `GET /transactions/{id}/postings` (the raw double-entry view). Typed creates `POST /transactions/{expense,income,refund,adjustment}` remain. |
| `splits` | `POST /splits`, `POST /splits/fronted`, `GET /splits`, `GET/PATCH/DELETE /splits/{id}` |
| `transfers` | `POST /transfers`, `GET /transfers`, `PATCH/DELETE /transfers/{id}` |
| `settlements` | `POST /settlements`, `GET /settlements`, `PATCH/DELETE /settlements/{id}` |
| `reports` | `GET /reports/{balance,budget,net-worth,spending,income,dashboard}` |
| `reports` (UI-oriented) | `GET /reports/reference-data`, `GET /reports/trends/{net-worth,spending,cashflow}` |

- **`GET /transactions`** filters: `type` (repeatable: income, expense, transfer, split, fronted,
  settlement, refund, adjustment), `accountId`, `categoryId` (includes subcategories), `friendId`,
  `refundOfId`, `search` (description/memo), `dateFrom`, `dateTo`, `status` (`posted` default,
  `reversed`, `all`); `sort` (`date`, `amount`, `description`) with `direction`; `limit` (max 500) /
  `offset`. The response is a `{items, total, limit, offset}` envelope. STRICT-mode system reversal
  rows are never listed; a corrected entry links to the one it replaced via `correctionOf`, and the
  original reports `replacedBy`.
- **Grouping** -- `GET /transactions?groupBy=date|month|category|account|type` clusters rows by group
  before paging, so a group is contiguous across pages; `sort`/`direction` then order the rows inside a
  group. Date and month groups are on the owner's local calendar and follow `direction` (newest first by
  default); category, account and type groups are alphabetical. Every row carries `groupKey` (`null`
  when ungrouped): `YYYY-MM-DD`, `YYYY-MM`, the category or account id (`""` = none) or the flat type.
  `GET /transactions/groups` takes the same filters plus a required `groupBy` and returns
  `{groupBy, groups: [{key, label, count, totals: [{currency, moneyIn, moneyOut}]}]}` in the same group
  order, for the group headers. `moneyIn` sums income and refunds, `moneyOut` expenses; the other types
  count but add to neither. Totals are per currency.
- **Friend-fronted expenses** (`type: fronted`, a friend paid; the amount is your share): they count as
  spending, and against the category budget, on the purchase date, exactly like any expense. What you
  still owe the friend is tracked per expense: repayments are not tied to an expense, so they clear the
  oldest fronted expenses first. A fronted `TransactionOut` has `unpaid` (the part not repaid yet),
  `GET /friends/balances` adds `frontedUnpaid` per friend, and `GET /reports/budget` adds `notPaidBack`
  (fronted spend in that category and month that is not repaid). Rows of any other type have `unpaid: null`.
- **Creating a transaction**: `type`, `description`, `amount` (a split's total bill), `date`, plus the
  fields that type needs (`accountId`, `categoryId`, `toAccountId`, `friendId`, `yourShare` and `splits`
  for a split, `refundOfId`, `direction`). A settlement's direction is derived from the friend's balance;
  sending one that disagrees is a `422`. A split's shares must add up to the total exactly.
- **Splitting later / un-splitting** -- `PATCH /transactions/{id}` on a plain *expense* with `yourShare` and
  a non-empty `splits` turns it into a split (`amount`, `accountId`, `categoryId` may change in the same call;
  the shares must add up to the bill exactly). Income can't be split, and an expense that has refunds is a
  `409`. `PATCH` on a split with `splits: []` turns it back into a plain expense for the whole bill; like any
  split edit it is a `409` when friends already settled, unless `force` / `removeSettlements` is sent.
  The entry keeps its id in DIRECT mode and is replaced (`correctionOf`) in STRICT mode.
- **Deleting a settlement** -- `DELETE /transactions/{id}` (or `DELETE /settlements/{id}`) on a settlement
  restores the friend's balance and the account; settlements have no edit in the web app.
- **`GET /reports/dashboard?month=YYYY-MM`** -- everything a dashboard needs computed server-side:
  net worth, income / spending / savings for the month, budgets, per-category spend with its
  subcategories, account balances and what friends owe you (or you owe them).
- **`GET /reports/reference-data`** -- accounts + categories + friends in one call.
- **`GET /reports/trends/...`** -- monthly time series for the last N months.
- **Split/fronted `DELETE` takes `?force=true` / `?remove_settlements=true`** query params
  (not a body -- DELETE-with-body is non-standard and some HTTP clients/proxies mishandle it).

## What's enforced at the API boundary

- **CORS**: no browser origin is allowed until `MONETARY_CORS_ORIGINS` is set (see Configuration).
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` on every
  response; `Strict-Transport-Security` when `MONETARY_ENV=production` (put a TLS-terminating proxy
  in front in that case).
- **Docs exposure**: `/docs`, `/redoc`, `/openapi.json` are only served when explicitly enabled
  (development environment, or `MONETARY_ENABLE_DOCS=true`).
- **Unhandled errors** never leak exception text or stack traces to the client; they're logged
  server-side and returned as a generic `500 InternalError`.
- **Read-your-writes.** Each request's database transaction is committed before its response is
  sent, so a client's very next request always sees the previous write.

## Testing

`./scripts/check.sh` runs the full backend test suite (unit, service, infrastructure and API-level tests,
plus deployment-config and tooling checks) with coverage. The web app's end-to-end suite (`npm run test:integration` in
`web/`) boots this API on a throw-away database and drives it from the real React app.
The shared sample dataset every test layer uses is `backend/tests/support/sample_data.py`.
