# Monetary Architecture

This document describes the architecture that is currently implemented in the
repository. It replaces the original planning document, which described a
CLI-only system and an earlier schema.

## 1. Current project overview

Monetary is a pre-release Python application for personal expense tracking,
double-entry bookkeeping, friend expense splitting, settlements, and reporting.
It is delivered as a single presentation interface:

- **FastAPI REST API** for browser, script, and UI clients

A CLI existed in earlier versions but has been removed; the API is now the
only supported way to interact with the application. Nothing in the domain
or application layers changed as a result -- they were always presentation-
agnostic, so dropping one adapter had zero effect on business logic.

The application uses:

- Python 3.11+
- SQLite
- Integer money values, stored as the smallest currency unit
- FastAPI, Uvicorn, Pydantic, bcrypt, and `python-multipart`
- One account per user, each with its own ledger database (see [MULTI_TENANT.md](MULTI_TENANT.md))
- Bearer-token authentication for protected API endpoints

The SQLite database is created automatically at:

```text
~/.monetary_0.5/monetary.db
```

The folder can be overridden with `MONETARY_DATA_DIR`; `MONETARY_DB_PATH` (the single-file setting of
earlier releases) is still read, see [MULTI_TENANT.md](MULTI_TENANT.md).

Project-facing metadata and runtime names are centralized in
`backend/monetary/config.py`. This module defines the display name, Python package name,
version, API prefix, database environment variable, CORS environment
variable, environment name, docs-exposure toggle, and default database path.
Future product-name changes should update that module first, then rename the
Python package directory and update the documentation examples.

## 2. Runtime entry points

### FastAPI application

The FastAPI application is defined in:

```text
backend/monetary/presentation/api/app.py
```

Run it from `backend/`:

```bash
cd backend
export PYTHONPATH="$PWD"
python -m uvicorn monetary.presentation.api.app:app --reload --port 8000
```

Important endpoints:

- `GET /health`
- `GET /docs`
- `GET /openapi.json`
- `POST /api/v0.5/setup/init`
- `POST /api/v0.5/auth/login`

## 3. Layered architecture

The code follows a lightweight Ports and Adapters / Hexagonal Architecture
with four practical layers.

```text
FastAPI routers ─── application services ─── domain model
                                 │
                                 └── repositories ─── SQLite
```

### 3.1 Domain layer

Location:

```text
backend/monetary/domain/
```

Responsibilities:

- Canonical enums and business concepts
- Money parsing and integer-point representation
- Double-entry balance validation
- Domain exceptions
- Password/security helpers
- Local-time and UTC conversion

Important modules:

| Module | Responsibility |
|---|---|
| `money.py` | Parses decimal amounts into integer points and formats money |
| `ledger.py` | Defines ledger legs/intents and checks debit-credit balance |
| `enums.py` | Account, entry, side, status, and ledger-mode enums |
| `exceptions.py` | Domain-level validation, conflict, not-found, and money errors |
| `security.py` | Password and security-answer hashing/verification |
| `time_utils.py` | Timezone-aware local date conversion |

### 3.2 Application layer

Location:

```text
backend/monetary/application/
```

Responsibilities:

- Use cases and transaction boundaries
- Account, category, user, friend, transaction, split, transfer, settlement,
  budget, statement, dashboard, and trend operations
- Construction of balanced ledger intents
- Selection and delegation to edit/delete policies

Important services:

| Service | Responsibility |
|---|---|
| `user_service.py` | Owner bootstrap, profile, friends, password changes |
| `account_service.py` | Accounts, categories, balances |
| `transaction_service.py` | Expenses, income, refunds, adjustments, basic transactions |
| `split_service.py` | Shared and friend-fronted expenses |
| `transfer_service.py` | Transfers between owner accounts |
| `settlement_service.py` | Payments against specific bills; assigning old payments |
| `bill_service.py` | Bills (splits and friend-paid expenses) with paid / matched / remaining; the stack rule |
| `match_service.py` | Matches between a friend-paid bill and a split |
| `budget_service.py` | Monthly budget status |
| `statement_service.py` | Account and friend statements |
| `dashboard_service.py` | Net worth, spending, income, dashboard data |
| `trends_service.py` | Historical API chart data |
| `ledger_service.py` | Posts and reverses balanced journal entries |

Posting strategies are in:

```text
backend/monetary/application/posting_strategies/
```

They build ledger intents for simple transactions, refunds, splits,
transfers, and settlements.

Edit policies are in:

```text
backend/monetary/application/edit_policies/
```

- `DirectEditPolicy`: updates or deletes records in place
- `StrictEditPolicy`: reverses existing entries and posts replacements where
  supported

### 3.3 Infrastructure layer

Location:

```text
backend/monetary/infrastructure/
```

Responsibilities:

- SQLite connection and schema bootstrap
- Repository functions for users, sessions, accounts, journal entries,
  postings, and related queries

`db.connect()`:

1. Resolves the configured or default database path.
2. Creates the parent directory.
3. Opens SQLite with row-based results.
4. Enables foreign keys.
5. Applies any pending schema migrations (`infrastructure/migrations.py`). The schema version is stored
   in `PRAGMA user_version`; a database created before versioning existed is adopted as version 1 without
   changing its data, and a database newer than the release is refused.

The schema is defined in `backend/monetary/infrastructure/db.py`; `LIVE_SCHEMA.sql` is the
schema snapshot generated from SQLite's `sqlite_master`.

### 3.4 Presentation layer

Location:

```text
backend/monetary/presentation/
```

The API translates HTTP requests into application-service calls; business
rules never live in this layer.

The API includes:

- Routers for setup, authentication, owner, accounts, friends, transactions,
  splits, transfers, settlements, and reports
- Pydantic request/response schemas, with field-level length/format limits
- Domain error handlers with a consistent error response, plus a catch-all
  handler so unexpected exceptions never leak internals to a client
- CORS configuration through `MONETARY_CORS_ORIGINS` (default: no origins
  allowed; `*` disables credentialed requests automatically)
- Per-IP rate limiting on login and password-reset endpoints
  (`backend/monetary/infrastructure/rate_limiter.py`)
- Baseline security headers and environment-gated API docs
  (`MONETARY_ENV`, `MONETARY_ENABLE_DOCS`)

## 4. Domain and ledger model

Every economic event is a `journal_entry` with two or more `posting` rows.
Each posting has exactly one populated side:

- `debit_amount`
- `credit_amount`

For every journal entry:

```text
SUM(debit_amount) = SUM(credit_amount)
```

The invariant is checked by the application before an entry is persisted.
SQLite also enforces that each posting has a positive value on exactly one
side.

Money is stored as integer points. For example, `125.50` in a two-decimal
currency is stored as `12550`. This avoids floating-point rounding errors.

### Account normal balances

| Account type | Normal side | Meaning |
|---|---|---|
| `ASSET` | Debit | Money owned, such as bank or cash |
| `EXPENSE` | Debit | Money spent |
| `DUE` | Debit | Positive means a friend owes the owner |
| `LIABILITY` | Credit | Money owed by the owner |
| `INCOME` | Credit | Money earned |
| `EQUITY` | Credit | System balancing account |

The `DUE` account intentionally uses one signed running balance per friend:

- Positive: friend owes the owner
- Negative: owner owes the friend

## 5. Current SQLite schema

The following is the current table schema implemented by
`backend/monetary/infrastructure/db.py` and represented in `LIVE_SCHEMA.sql`.
The application bootstraps the schema automatically. The complete SQL,
including every index, lives only in [`LIVE_SCHEMA.sql`](LIVE_SCHEMA.sql), so there is
a single copy to keep in sync.

### 5.1 `ledger_settings`

One row (`id = 1`) holding the ledger's own configuration. Who may sign in, and their name and email, belong to
the control database (see `MULTI_TENANT.md`); the ledger keeps nothing that identifies or authenticates a person.

| Column | Meaning |
|---|---|
| `id` | Always `1` |
| `timezone` | IANA timezone the ledger's dates are read in |
| `home_currency_code` | Default currency |
| `ledger_mode` | `DIRECT` or `STRICT`; defaults to `DIRECT` |
| `created_at`, `updated_at` | ISO timestamps |

### 5.2 `contact`

The friends this ledger shares money with. They are local records only: a contact cannot sign in.
`linked_user_id` is reserved for linking a contact to a platform account later; it is `NULL` today.

| Column | Meaning |
|---|---|
| `id` | Primary key |
| `name` | Display name |
| `email` | Unique email |
| `phone` | Optional contact detail |
| `linked_user_id` | Platform account this contact is linked to (future); no foreign key, it lives in another database |
| `created_at`, `updated_at` | ISO timestamps |

**The owner's email.** A friend may not have the account holder's own email. The ledger cannot see that
email (it lives in `control.db`), so `user_service.add_friend` / `update_friend` take it as a required
`own_email` argument; the friends router supplies it from the signed-in account. This is a validation on a
mutable value, not an invariant: it is checked only when a friend is created or edited. Changing the
account email later (an admin action) is deliberately **not** checked against contacts, because a
collision is harmless and admin code must not open ledgers. When real-user friends are added, the rule
"a contact cannot link to its own account" will be enforced by a permanent public id, not by email.

### 5.3 `account`

This is the chart of accounts. Real accounts, categories, friend due
accounts, and the system equity account are represented as account rows.

| Column | Meaning |
|---|---|
| `id` | Primary key |
| `name` | Account/category display name |
| `account_type` | `ASSET`, `LIABILITY`, `EXPENSE`, `INCOME`, `DUE`, or `EQUITY` |
| `currency_code` | Currency; null only for the system equity account |
| `parent_account_id` | Optional parent category |
| `budget_limit` | Integer-point monthly budget |
| `counterparty_id` | Contact (friend) represented by a `DUE` account; references `contact.id` |
| `is_system` | System-account marker |
| `is_active` | Active/deactivated marker |
| `created_at`, `updated_at` | ISO timestamps |

### 5.4 `journal_entry`

Represents an economic event.

| Column | Meaning |
|---|---|
| `id` | Primary key |
| `description` | Human-readable title |
| `memo` | Optional note |
| `entry_type` | `NORMAL`, `SPLIT`, `FRONTED`, `REFUND`, `TRANSFER`, `ADJUSTMENT`, `SETTLEMENT`, or `REVERSAL` |
| `currency_code` | Currency shared by all postings |
| `entry_date` | Economic date/time in UTC |
| `status` | `POSTED` or `REVERSED` |
| `category_id` | Category account, when applicable |
| `reversal_of_id` | Original entry when this is a reversal |
| `reversed_by_id` | Reversal entry created for this entry |
| `refund_of_id` | Original entry refunded by this entry |
| `created_at`, `updated_at` | Audit timestamps |

`category_id` is stored directly because a split can have a zero owner share,
meaning the category cannot always be inferred from the postings alone.

### 5.5 `posting`

Represents one debit or credit leg of a journal entry.

| Column | Meaning |
|---|---|
| `id` | Primary key |
| `journal_entry_id` | References `journal_entry.id` |
| `account_id` | References `account.id` |
| `debit_amount` | Non-negative integer points |
| `credit_amount` | Non-negative integer points |
| `created_at`, `updated_at` | Audit timestamps |

The database check requires exactly one positive side:

```sql
CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR
    (credit_amount > 0 AND debit_amount = 0)
)
```

### 5.6 Current indexes

The current schema creates indexes for:

- Account type, parent, and counterparty
- Journal-entry date, status, type, refund parent, and category
- Posting entry and account
- Session owner, expiry, and token hash

## 6. Feature flows

### Ordinary expense

1. The API validates the account, category, amount, and currency.
2. `transaction_service` creates a simple posting strategy intent.
3. The category receives a debit.
4. The asset/liability account receives the balancing credit.
5. `ledger_service.post()` writes the journal entry and postings atomically.

### Income

Income uses the opposite accounting direction:

1. The asset account receives a debit.
2. The income category receives a credit.

### Split expense

For an owner-paid split:

1. The payment account is credited for the total.
2. The expense category is debited for the owner's share.
3. Each friend's `DUE` account is debited for that friend's share.
4. The entry type is `SPLIT`.

The current implementation derives split composition from the entry's postings;
there is no separate `split_participant` table in the current schema.

### Friend-fronted expense

When a friend pays the full amount:

1. The expense category is debited.
2. The friend's `DUE` account receives the balancing credit.
3. The entry type is `FRONTED`.

### Refund

A refund is linked to the original entry through `refund_of_id`. The service
checks the remaining refundable amount before posting a new `REFUND` entry.

### Settlement

A settlement pays specific bills. A bill is a posted `SPLIT` (the friend owes you) or `FRONTED` expense (you owe
the friend), seen through the friend's `DUE` account. One `SETTLEMENT` entry is posted per bill
(`settles_entry_id`), grouped by `payment_group`; it posts against the `DUE` account and the chosen owner
asset or liability account. All bills of one payment point the same way, and the direction and cap come from the
bill, not the balance sign. `remaining = amount - paid - matched` is always computed.

A `bill_match` links a fronted bill to a split of the same friend (partial, many-to-many). It has no postings and
does not change the balance. Stack rule: bills <- matches <- payments; a lower layer cannot change while a
higher one rests on it unless the caller passes `remove_linked`. Settlements from before migration 3 have no bill
and are "unassigned" until linked by hand.

### Transfer

A transfer moves value between two owner accounts without affecting income or
expense totals. It is recorded as a balanced `TRANSFER` entry.

## 7. Edit and deletion policies

The owner setting `ledger_mode` controls future corrections:

### `DIRECT`

- Updates supported entry metadata and postings in place.
- Deletes supported entries directly.
- Keeps no reversal record for those changes.
- Is the current default.

### `STRICT`

- Uses reversal entries to preserve posted history.
- An edit reverses the original and posts a replacement where supported.
- A delete reverses the original without replacement.

Both modes preserve the debit-credit balance invariant. Mode changes affect
future operations; they do not rewrite old entries.

Split/fronted edit and delete operations additionally protect payments and matches that rest on the bill
(`BillDependencyError`, 409). The API accepts `removeLinked` for explicit override behavior; STRICT mode
repoints links to the replacement entry.

## 8. Validation and error handling

The application validates:

- Supported account, entry, side, status, and ledger-mode values
- Positive, correctly formatted monetary amounts
- Maximum two decimal places for money input
- Balanced journal entries
- Exactly one debit or credit side per posting
- Currency compatibility between entries and accounts
- Valid owner, account, category, friend, and journal-entry references
- Refund amounts against the original entry's remaining refundable amount
- Transfer safety rules for liability accounts
- Settlement and split consistency

The API maps domain exceptions to structured responses:

```json
{
  "detail": "Human-readable message",
  "error_type": "ValidationError"
}
```

The per-request database connection (`presentation/api/deps.py::get_db`)
rolls back automatically whenever a domain, money, value, or SQLite
constraint error is raised while handling a request.

### Connection state (web)

The web app tracks whether it can reach the server (`web/src/lib/api/connection.ts`). The HTTP client reports
every outcome: any answer means "online" (even a 4xx), a failed or timed-out request means "unreachable" (or
"offline" when the device has no network), and a gateway 502/503/504 means "server unavailable". While the
connection is down, `useConnectionMonitor` re-checks `GET /meta` with a doubling delay
(`VITE_CONNECTION_RETRY_BASE_SECONDS` to `VITE_CONNECTION_RETRY_MAX_SECONDS`), straight away when the device
comes back online or the tab becomes visible, and refetches the data once the server answers. `ConnectionBanner`
shows the state to the person. Writes are never queued or replayed: with no connection they fail at once so the
person knows they were not saved; reads are retried for temporary failures only (no connection, 5xx).

## 9. API authentication

The owner is bootstrapped through `POST /api/v0.5/setup/init`. Subsequent API
logins use the owner's email and password. Sessions:

- Use random bearer tokens
- Store only SHA-256 token hashes
- Expire after seven days
- Can be invalidated by logout or password change

Passwords and security answers are stored as bcrypt hashes.

## 10. Configuration

### Database

```bash
export MONETARY_DATA_DIR="$PWD/data"
```

### API CORS

```bash
export MONETARY_CORS_ORIGINS="http://localhost:8501,http://localhost:3000"
```

The default is no allowed origins at all (server-to-server calls are
unaffected; only browser-based clients are subject to CORS). `*` is accepted
for a public API, but credentialed requests are then disabled automatically,
since wildcard origin + credentials is invalid per the CORS spec.

### Environment / docs exposure

```bash
export MONETARY_ENV=development       # or "production" (default)
export MONETARY_ENABLE_DOCS=true      # force /docs, /redoc, /openapi.json on or off
```

`/docs`, `/redoc`, and `/openapi.json` are served by default only in
`development`; `production` (the default) disables them unless
`MONETARY_ENABLE_DOCS=true` is set explicitly.

## 11. Project naming

The product is **Monetary**.

| Surface | Value |
|---|---|
| Display name | `Monetary` (configurable: `MONETARY_APP_NAME`) |
| Python package | `monetary` |
| API import path | `monetary.presentation.api.app:app` |
| Application version | `VERSION` in `backend/monetary/config.py` |
| API route prefix | `/api/v0.5` |
| Environment variables | `MONETARY_*` |
| Default database path | `~/.monetary_0.5/monetary.db` |

Runtime-facing values are read from `backend/monetary/config.py` rather than duplicated
throughout the implementation. The database directory name carries the schema
generation: the schema has no migrations, so an incompatible release starts a
fresh directory instead of opening an old database.

## 12. Repository structure

```text
<repository-directory>/
├── backend/                  # Python backend: everything needed to run and test the API
│   ├── monetary/             # the package (FastAPI + SQLite)
│   │   ├── config.py         # product identity + every environment variable
│   │   ├── seed_defaults.json
│   │   ├── domain/           # money, ledger invariants, enums, exceptions, hashing -- no DB or HTTP
│   │   ├── application/      # services, posting strategies, edit policies
│   │   │   ├── edit_policies/
│   │   │   └── posting_strategies/
│   │   ├── infrastructure/   # SQLite schema/connection, repositories, rate limiter
│   │   └── presentation/
│   │       └── api/          # FastAPI app, routers, schemas, error handling
│   ├── tests/                # unit/ service/ infrastructure/ api/ deployment/ tooling/ (+ support/)
│   ├── pyproject.toml        # ruff, pytest and coverage configuration
│   ├── requirements.txt  requirements-dev.txt
│   └── .env.example          # backend configuration template
├── web/                      # React + TypeScript web app (self-contained npm project)
├── docs/                     # API, architecture, SQLite schema (archive/ holds historical records)
├── scripts/                  # dev.sh, check.sh, commit_lint.py
├── .github/                  # workflows, release-please config, templates, CODEOWNERS
└── README.md
```

## 13. Related documentation

- [`README.md`](../README.md): installation and application startup
- [`API.md`](API.md): API endpoints and authentication
- [`LIVE_SCHEMA.sql`](LIVE_SCHEMA.sql): complete generated SQLite schema
- [`MULTI_TENANT.md`](MULTI_TENANT.md): design for per-user databases, the control database and the superuser Admin area
- [`CONTROL_SCHEMA.sql`](CONTROL_SCHEMA.sql): schema of the control database (accounts, logins, workspaces, audit log)
