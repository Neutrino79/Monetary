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
- `MONETARY_DATA_DIR` -- directory holding everything the service stores: `control.db` (accounts, sessions,
  audit log) and `tenants/` (one SQLite ledger per user). Default `~/.monetary_0.5`.
- `MONETARY_DB_PATH` -- the single ledger file of earlier releases. Still honoured: when no accounts exist
  yet, that file is adopted in place as the first superuser's ledger, and (if `MONETARY_DATA_DIR` is unset)
  its folder becomes the data directory. See `docs/MULTI_TENANT.md`.
- `MONETARY_CORS_ORIGINS` -- comma-separated allowed browser origins (default:
  none allowed). `*` is accepted for a public API, but credentialed requests
  are then disabled automatically (wildcard origin + credentials is invalid
  per the CORS spec and rejected by browsers anyway).
- `MONETARY_ENV` -- `production` (default) or `development`.
- `MONETARY_DEMO_MODE` -- `true` turns on demo mode (default off): the data directory defaults to a
  separate `demo/` folder, a demo account with a sample ledger is generated on first start, `GET /meta` reports `demo: true`, and
  `POST /auth/demo` (404 otherwise) returns a session without credentials. Password change/reset are
  answered 403. Registration is answered 403. The server refuses a data directory that holds real accounts.
- `MONETARY_DEMO_RESET` -- with demo mode on, `true` deletes and rebuilds the demo database at every
  start (refused, and the server stops, when the data directory holds real accounts). Default off: the
  sample ledger is created once and reused.
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

Email + password login, with security-question-based password recovery. Every account has its own
ledger database; the first account is a superuser, and others either sign up (`POST /auth/register`,
202 with the same generic answer whether or not the email is known, rate-limited, waits for approval) or
are created by a superuser. `POST /auth/login` answers 403 with `AccountPendingApproval`,
`AccountRejected`, `AccountSuspended` or `AccountPendingDelete` only after a correct password (a wrong
email and a wrong password both give the same 401). While a temporary password is pending, everything
except `GET /me`, `POST /auth/change-password` and `POST /auth/logout` answers 403
`PasswordChangeRequired`; an account without a ledger gets 403 `NoLedgerError`.

**Protections** (every number is a setting, see the README configuration table):
- *Lock:* after `MONETARY_LOGIN_MAX_FAILURES` wrong passwords (or wrong security answers) in a row an account
  is locked for `MONETARY_LOGIN_LOCKOUT_MINUTES`; sign-in and password reset answer 429 `AccountLocked` while
  it lasts. A superuser can lift it (`POST /admin/users/{id}/unlock`, or `python -m monetary.cli unlock`).
- *Temporary passwords* expire after `MONETARY_TEMP_PASSWORD_HOURS`; a correct but expired one answers 403
  `TemporaryPasswordExpired` and needs a new reset by an administrator.
- *Asking again:* registering with the email of a **rejected** request puts it back to pending with the new
  details (same generic 202), at most `MONETARY_MAX_REREQUESTS` times; after that only a superuser can
  `reopen` it. The 403 `AccountRejected` message says which applies.
- *Captcha:* `GET /auth/captcha` returns `{provider, challenge, siteKey}`. With provider `altcha` (default;
  a self-contained proof of work) or `turnstile`, `POST /auth/register`, `GET /auth/security-question` and
  `POST /auth/reset-password` need the solution in an `X-Captcha` header, and `POST /auth/login` needs it
  once the client address has failed `MONETARY_LOGIN_CAPTCHA_AFTER` times. Without it: 400 `CaptchaRequired`.
  Each proof-of-work solution works once. `MONETARY_CAPTCHA_PROVIDER=none` turns it off.
- `POST /auth/register` also accepts an optional hidden `website` field; a request that fills it in is a bot
  and is answered normally but ignored.
`GET /me` returns `{id, email, name, role, status, mustChangePassword, hasLedger}`.
`GET /me/export` downloads the signed-in user's own ledger as a SQLite file (a consistent snapshot, without
password hashes, security answers or sessions); it is disabled in demo mode.

Self-service for the signed-in user (all but the reads are disabled in demo mode):

- `GET /me/sessions` -- where the account is signed in: `[{id, createdAt, expiresAt, lastSeenAt, ip, userAgent, current}]`;
  `current` is true for the session making the request.
- `DELETE /me/sessions/{id}` -- sign out one device (404 if it is not yours).
- `POST /me/sessions/revoke-others` -- sign out every device except this one; `{ended}`.
- `GET /me/account` -- `{memberSince, lastLoginAt, ledgerBytes, securityQuestionId, deleteGraceDays}`.
- `PUT /me/security-question` -- `{currentPassword, securityQuestionId, securityAnswer}`; needs the current password.
- `POST /me/delete` -- `{password}`: puts the account in `pending_delete` (locked, all sessions ended). The
  superuser can restore it, or purge it after `deleteGraceDays`. The superuser account cannot delete itself (409).

**Is the instance set up?** `GET /api/v0.5/setup/status` (public) returns `{"initialized": true|false}`.
A client can use it to choose between a first-run screen and a sign-in screen; `POST /setup/init` still
re-checks atomically and answers `409` once any account exists. It creates the first superuser and their ledger.

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
Both of these are also rate-limited per client IP and need the captcha above. The question endpoint never
reveals whether an email has an account: an unknown email gets a stable decoy question, and any answer is
then refused with the same "Invalid email or security answer". A correct reset (or
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
| `AccountLocked` | 429 | Too many wrong passwords in a row; the account is locked for a while |
| `CaptchaRequired` | 400 | The request needs a solved captcha (`X-Captcha` header) |
| `TemporaryPasswordExpired` | 403 | The temporary password is too old; ask an administrator for a new one |
| `InternalError` | 500 | An unexpected server-side error. The response never includes the raw exception or a traceback; details are logged server-side only |
| anything else | 400 | Fallback |

FastAPI's own request-validation errors (missing required field, wrong type) return its standard
422 shape (`detail` is a list of `{loc, msg}` items) separately, before any of our code runs.

## Endpoint map

All routes are under `/api/v0.5`. Full detail is in `/docs` (when enabled); this is the shape:

| Resource | Routes |
|---|---|
| `system` | `GET /meta` (public: app name, tagline, version, `demo` flag), `GET /me` (the signed-in account), `GET /health` (liveness + DB connectivity), `GET /` (service info) |
| `setup` | `GET /setup/status` (public), `POST /setup/init` -- the one-time owner creation that logs them in |
| `auth` | `GET /auth/security-questions`, `POST /auth/register` (public sign-up request), `POST /auth/login`, `POST /auth/demo` (demo mode only), `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/security-question`, `POST /auth/reset-password` |
| `owner` | `GET /owner`, `PATCH /owner` |
| `accounts` | `POST /accounts` (optional `openingBalance`, LIABILITY-only `creditLimit` / `statementDay`), `GET /accounts` (includes `balance` and `lastActivity`, the local date of the newest live entry), `PATCH /accounts/{id}`, `GET /accounts/{id}/balance`, `GET /accounts/{id}/statement` (every posting in date order with the balance after it -- for a liability, the amount owed; same row shape as the friend statement; reversed entries are left out), `POST /accounts/{id}/reconcile` (body `{balance, date?}`: what the bank shows; any difference is posted as one adjustment and returned as `{difference, entryId}`, `entryId: null` when already matched), `POST /accounts/{id}/{deactivate,reactivate}` |
| `categories` | `POST /categories`, `GET /categories` (`?type=EXPENSE\|INCOME` -- income sources are INCOME categories), `PATCH /categories/{id}` (name, colour, budget, parent), `POST /categories/{id}/{deactivate,reactivate}` |
| `friends` | `POST /friends`, `GET /friends`, `PATCH /friends/{id}` (name, email, phone), `DELETE /friends/{id}`, `GET /friends/balances`, `GET /friends/{id}/statement` (every entry against the friend, oldest first: `entryType`, `date` in the owner's timezone, `delta`, `runningBalance`, and for payments `settlesEntryId` / `paymentGroup`), `GET /friends/{id}/bills?open=` (splits they owe you and expenses they paid for you, each with `amount`, `paid`, `matched`, `remaining`, `status`), `GET /friends/{id}/matches`, `GET /friends/{id}/unassigned-payments` |
| `transactions` | **Flat API:** `POST /transactions` (one body for every type -- income, expense, transfer, split, fronted, settlement, refund, adjustment), `GET /transactions` (server-side filter / sort / group / paging), `GET /transactions/groups` (group headers), `GET/PATCH/DELETE /transactions/{id}`, `GET /transactions/{id}/postings` (the raw double-entry view). Typed creates `POST /transactions/{expense,income,refund,adjustment}` remain. |
| `tags` | `POST /tags`, `GET /tags` (every tag, alphabetical, with its `uses` count of live transactions), `PATCH /tags/{id}` (rename; onto an existing tag it merges), `DELETE /tags/{id}` (removes the tag from every transaction). See *Tags* below. |
| `splits` | `POST /splits`, `POST /splits/fronted`, `GET /splits`, `GET/PATCH/DELETE /splits/{id}` |
| `transfers` | `POST /transfers`, `GET /transfers`, `PATCH/DELETE /transfers/{id}` |
| `settlements` | `POST /settlements` (pay specific bills: `{friendId, accountId, allocations: [{billId, amount}], date?, note?}`; one settlement entry per bill, sharing a `paymentGroup`), `GET /settlements`, `PATCH /settlements/{id}` (note only), `DELETE /settlements/{id}`, `POST /settlements/{id}/assign` (tie an unassigned old payment to bills) |
| `matches` | `POST /matches` (`{friendId, owedToMeId, owedByMeId, amount}`), `PATCH /matches/{id}` (`{amount, removeLinked?}`), `DELETE /matches/{id}?removeLinked=` -- set a bill you owe a friend against a split they owe you; no money moves |
| `reports` | `GET /reports/{balance,budget,net-worth,spending,income,dashboard}` |
| `reports` (UI-oriented) | `GET /reports/reference-data`, `GET /reports/trends/{net-worth,spending,cashflow}` |

- **`GET /transactions`** filters: `type` (repeatable: income, expense, transfer, split, fronted,
  settlement, refund, adjustment), `accountId`, `categoryId` (includes subcategories), `friendId`,
  `refundOfId`, `search` (description/memo), `dateFrom`, `dateTo`, `status` (`posted` default,
  `reversed`, `all`); `sort` (`date`, `amount`, `description`, `category`, `account`) with `direction`; `limit` (max 500) /
  `offset`. The response is a `{items, total, limit, offset}` envelope. STRICT-mode system reversal
  rows are never listed; a corrected entry links to the one it replaced via `correctionOf`, and the
  original reports `replacedBy`.
- **Grouping** -- `GET /transactions?groupBy=date|month|category|account|type|tag` clusters rows by group
  before paging, so a group is contiguous across pages; `sort`/`direction` then order the rows inside a
  group. Date and month groups are on the owner's local calendar and follow `direction` (newest first by
  default); category, account and type groups are alphabetical. Every row carries `groupKey` (`null`
  when ungrouped): `YYYY-MM-DD`, `YYYY-MM`, the category or account id (`""` = none) or the flat type.
  `GET /transactions/groups` takes the same filters plus a required `groupBy` and returns
  `{groupBy, groups: [{key, label, count, totals: [{currency, moneyIn, moneyOut}]}]}` in the same group
  order, for the group headers. `moneyIn` sums income and refunds, `moneyOut` expenses, friend-paid expenses and *your own share* of splits (0 when a friend carries the whole bill); the other types
  count but add to neither. Totals are per currency.
- **Tags** -- a managed list of labels you pick on transactions, for slicing ("everything for the Goa
  trip"); they never affect balances, budgets or reports. Tags are created on their own
  (`POST /tags {name}`, 409 if it exists) and persist until deleted, even when nothing uses them. Names
  are trimmed, lowercased, a leading `#` is dropped, at most 30 characters, no commas. `POST /transactions`
  takes `tags: ["trip goa", "work"]` and `PATCH /transactions/{id}` the complete new set (`[]` clears,
  absent leaves them); **every name must already exist** (else 422 naming the unknown ones), at most 10
  per transaction. Every transaction returns `tags`, sorted. A tags-only edit never touches the ledger
  (no STRICT replacement), and a STRICT replacement keeps the original's tags. `GET /transactions` and
  `GET /transactions/groups` take a repeatable `tag` filter (matches *any* of the tags). `groupBy=tag`
  lists a transaction under every tag it carries, so group totals can add up to more than the period
  total; untagged rows form an "Untagged" group (key `""`), listed last, and with a `tag` filter only the
  matching tags appear as groups. `total` of a `groupBy=tag` list counts those repeated rows.
- **Friend-fronted expenses** (`type: fronted`, a friend paid; the amount is your share): they count as
  spending, and against the category budget, on the purchase date, exactly like any expense. What you
  still owe the friend is tracked per expense: repayments are not tied to an expense, so they clear the
  oldest fronted expenses first. A fronted `TransactionOut` has `unpaid` (the part not repaid yet),
  `GET /friends/balances` adds `frontedUnpaid` per friend, and `GET /reports/budget` adds `notPaidBack`
  (fronted spend in that category and month that is not repaid). Rows of any other type have `unpaid: null`.
- **Creating a transaction**: `type`, `description`, `amount` (a split's total bill), `date`, plus the
  fields that type needs (`accountId`, `categoryId`, `toAccountId`, `friendId`, `yourShare` and `splits`
  for a split, `refundOfId`, `direction`). A settlement can no longer be created here (`422`, use
  `POST /settlements`). `description` is required for every type. A split's shares must add up to the total exactly.
- **Splitting later / un-splitting** -- `PATCH /transactions/{id}` on a plain *expense* with `yourShare` and
  a non-empty `splits` turns it into a split (`amount`, `accountId`, `categoryId` may change in the same call;
  the shares must add up to the bill exactly). Income can't be split, and an expense that has refunds is a
  `409`. `PATCH` on a split with `splits: []` turns it back into a plain expense for the whole bill; like any
  split edit it is a `409` `BillDependencyError` when payments or matches rest on the split and the change
  would take it below what is paid plus matched, unless `removeLinked: true` is sent (the payments and matches are then deleted).
  The entry keeps its id in DIRECT mode and is replaced (`correctionOf`) in STRICT mode.
- **Bill-based settlements** -- every payment is tied to specific bills (`settlesEntryId`). A bill is a split
  (they owe you) or a friend-paid expense (you owe them); `remaining = amount - paid - matched`, all computed,
  never stored. One payment covers one direction only; direction and the per-bill cap come from the bill. A
  payment can't predate its bill. To net opposite bills, create a **match** first (no ledger effect, the friend's
  balance does not change). Stack rule: bills <- matches <- payments. While payments are attached, a match
  can't change and a bill can't be deleted or lowered below matched + paid; the API answers `409`
  (`error_type: BillDependencyError`, `details.payments` / `details.matches`) unless `removeLinked` is sent.
  Matches go with their bill without asking (no money involved). A payment's amount can't be edited: only its
  note (`PATCH /settlements/{id}`); delete it and record it again.
- **Unassigned payments** -- payments recorded before this feature carry no bill. They are never guessed:
  `GET /friends/{id}/unassigned-payments` lists them, `POST /settlements/{id}/assign` ties one to bills (amounts
  must add up to the payment), and new payments for that friend are a `409` until they are all tied.
- **Deleting a settlement** -- `DELETE /transactions/{id}` (or `DELETE /settlements/{id}`) on a settlement
  restores the friend's balance, the bill and the account.
- **`GET /reports/dashboard?month=YYYY-MM`** -- everything a dashboard needs computed server-side:
  net worth, income / spending / savings for the month, budgets, per-category spend with its
  subcategories, account balances and what friends owe you (or you owe them).
- **`GET /reports/spending-pace?month=YYYY-MM`** -- the data behind the dashboard's spending-pace chart:
  `days` (what was spent each day and the running total, for every elapsed day), `previous` (the month
  before, one running total per day, for comparison), `budgetTotal` (the sum of every category budget, or
  `null` when none are set) and `projection`. Spend is what the dashboard calls spending: expense postings,
  so your share of a split counts and refunds reduce it. Days follow the owner's timezone. For a past
  month `elapsedDays` is the whole month and `projection` is `null`; a future month has no days.
  For the current month `projection` is where the month should end (`expected`, with a `low`..`high`
  range) plus the same per day from tomorrow on. It is learned from up to six earlier months -- what
  they added after the same day, so rent paid on the 1st does not inflate it -- with the range being
  the lowest..highest (3-4 months) or the middle half (5-6). `method: "history"` needs three earlier
  months with spending; with fewer it is `"pace"` (this month's daily average, `low == high`).
  It is `null` before day 3, once the month is over, or when nothing was spent yet.
- **Reports & Trends analysis** -- five read-only endpoints behind the Reports page. All are in the
  owner's home currency and calendar months (owner timezone). `months` (1-36, default 12) is a window
  ending with the current month, compared with the equal window just before it. The current month is
  partial: it is flagged `isPartial` and never counts toward "normal". Months before the ledger's first
  activity are no data, not quiet months, and are left out of every "usual" range.
  - **`GET /reports/overview?months=N`** -- `points` (income, expense, `net` kept, `savingsRate`, a trailing
    3-month `rollingExpense`, and `unusual` / `versusUsualPct` for a month more than 1.75 standard
    deviations from the window's typical spending), `previousPoints`, `current` / `previous` totals,
    `netWorth` per month with `liabilities` (what is owed), `incomeSources` and `findings`. A finding is a
    `code` (`savings_rate`, `unusual_months`, `main_income_cover`, `debt_change`) plus the numbers behind
    it; the client words it.
  - **`GET /reports/categories?months=N&kind=spending|income`** -- every root category against its own
    normal: `points` (at least 6 months, so a 3-month window still has a range to judge against), `usual`
    (the 20th / 50th / 80th percentile of the earlier months, `null` with fewer than 4), `state`
    (`above` / `below` / `normal`, with a pad so small moves stay normal), `slope` (change per month),
    `average` against `previousAverage`, `changePct` and `sharePct`.
  - **`GET /reports/compare?aFrom=&aTo=&bFrom=&bTo=`** (`YYYY-MM`, each period at most 36 months) -- period A
    against period B: `income` / `expense` / `kept` for each and per spending category the totals, purchase
    counts, average purchase, and the change split into `volumeEffect` (bought more or less often) and
    `ticketEffect` (paid more or less each time); the two always add up to `change`. A purchase is an entry
    that debits the category; refunds change the total but are not counted as purchases.
  - **`GET /reports/budget-history?months=N`** -- per budget: `points` per month, how many complete months
    it `held`, `typicalPct` of the limit, and a `suggestion` (`keep`, `raise` to the limit that would have
    held in about 10 of 12 months, or `tighten` when use is under 75% and it never went over). Also
    `monthTotals` against `limitTotal`, `coveragePct` (spending that has a budget) and `unbudgeted`
    categories with a suggested monthly limit, or a yearly one for lumpy spending.
  - **`GET /reports/outlook?months=N`** -- net worth now, the last 12 months of it, and a 12-month
    `forecast` (end of this month onward, `expected` with a `low`..`high` range of one standard
    deviation of the running total). With a year of history each month repeats the same month a year
    earlier (`method: "seasonal"`); with 3-11 complete months it uses their average (`"average"`); with
    no history `method` is `"none"` and `forecast` is empty. The rest of the current month is what is
    still expected after what has already happened. `yearEnd` is the current calendar year: income,
    spending, kept and net worth at December. `levers` are budgets the last three complete months ran
    over; holding the limit would save `monthlySaving` a month.
- **`GET /reports/reference-data`** -- accounts + categories + friends in one call.
- **`GET /reports/trends/...`** -- monthly time series for the last N months.
- **Split/fronted `DELETE` takes `?removeLinked=true`** (replaces `force` / `remove_settlements`) query param
  (not a body -- DELETE-with-body is non-standard and some HTTP clients/proxies mishandle it).

## Administration (admins and the superuser)

Everything under `/api/v0.5/admin` requires an `admin` or `superuser` session. `delete`, `restore` and `PUT .../role` are superuser only. An actor can act only on a strictly lower role and never on their own account (`409`; revoking your own sessions is allowed). There is exactly one superuser. The role is read from the control
database on every request, so a demotion or suspension applies at once. It is disabled (403) in demo
mode. Superusers manage *accounts*; they never see ledger contents. Every action writes one audit row
(actor, action, target, small detail, client address) and never a password.

- `GET /admin/stats` -- `{totalUsers, byStatus, pendingApproval, activeSuperusers, activeAdmins, ledgerCount, ledgerBytes}`.
- `GET /admin/users?status=&q=&limit=&offset=` / `GET /admin/users/{id}` -- accounts, never any credential.
- `POST /admin/users` `{name, email, currency, timezone?, role?}` -- active account with an empty ledger and a
  generated temporary password, returned **once** as `temporaryPassword`; the user must change it at first sign-in.
- `POST /admin/users/{id}/approve` | `reject` (`{reason?}`) | `suspend` (`{reason?}`) | `reactivate` |
  `reset-password` (new temporary password, returned once) | `unlock` (lift a sign-in lock) | `reopen` (a
  rejected request back to pending, with a fresh allowance of re-requests) | `revoke-sessions` | `delete` (locks the account,
  data purged after 30 days) | `restore`; `PUT /admin/users/{id}/role` `{role: "user"|"admin"}` (`superuser` -> `409`, unknown -> `422`).
- `PATCH /admin/users/{id}` `{name?, email?, timezone?}` -- correct a profile (equal/higher role `403`, taken
  email `409`); a new email signs the person out.
- `GET /admin/users/{id}/sessions` -- live sign-ins `{id, createdAt, expiresAt, lastSeenAt, ip, userAgent}` (never
  tokens); `DELETE /admin/users/{id}/sessions/{sessionId}` ends one (`404` if it is not theirs).
- `POST /admin/users/bulk` `{action: approve|reject|suspend|reactivate, userIds, reason?}` -- at most
  `MONETARY_ADMIN_BULK_LIMIT` (50) ids; each account is attempted on its own and reported:
  `{action, succeeded, failed, results: [{userId, ok, error}]}`. There is no bulk delete.
- `POST /admin/purge` (superuser) -- permanently remove accounts whose 30-day grace ended; `{purged}`.
- `POST /admin/purge-selected` (superuser) -- `{userIds}`: permanently remove those accounts **now**, skipping the
  grace period. Only accounts already in `pending_delete` are touched; others are ignored. Audited as `user.purge`
  with `forced: true`.
  `stats.overdueForPurge` counts them. User rows also carry `lastActivityAt` and `storageBytes`.
- `GET /admin/audit-log?user_id=&limit=&offset=` -- newest first.
- `GET /admin/audit-log/export` -- the whole audit log as a CSV download (`audit-log.csv`, newest first, at most
  50,000 rows) with names and emails beside the ids. Admins and the superuser. Cells that start with `=`, `+`,
  `-` or `@` are prefixed with `'` so a spreadsheet never runs them.
- `GET /admin/platform` (superuser only) -- `{version, apiVersion, environment, demoMode, settings: [{key, label,
  value}], controlDbBytes, ledgerCount, ledgerBytes}`. Read-only; shows sign-in and access settings only, never
  keys, secrets or the data directory path.
- Rules: a wrong state change is `409`; acting on an equal or higher role is `403`; `POST /admin/users` with
  `role: admin` needs the superuser and `role: superuser` is `409`.

Without the web UI, `python -m monetary.cli` (run from `backend/`, same `MONETARY_DATA_DIR`) offers
`create-superuser` (refused once one exists), `transfer-superuser --to EMAIL [--demote-to admin|user]`, `list-users`, `reset-password`, `unlock`, `migrate-all`, `usage`, `backup --to DIR` and
`purge [--dry-run]`. Passwords come from a prompt, `--password-stdin` or `MONETARY_PASSWORD`, never from
an argument.

Operations: run `purge` daily (cron or a systemd timer). It finishes deletions whose 30-day grace period
has ended (the account, its sessions and its ledger file; the audit row keeps the email), drops sign-up
requests nobody approved in 30 days and rejected ones older than 30 days, and removes leftover ledger
files that no account refers to. A ledger file outside the data directory (an adopted earlier install) is
never deleted automatically. `backup --to DIR` writes consistent snapshots of `control.db` and every
ledger (safe while the service runs); restore by copying `control.db` and `tenants/` into an empty
`MONETARY_DATA_DIR`.

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
