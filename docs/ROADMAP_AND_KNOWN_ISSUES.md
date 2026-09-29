# Duevia — Remaining Work, Known Issues & Testing Guide

This is the living follow-up to the API-only refactor and hardening pass.
It has three parts:

1. **Run this after any change** — the one command that tells you if the
   system still works.
2. **Known issues / accepted limitations** — things found and deliberately
   *not* fixed, with the reasoning, so nobody re-discovers them from scratch.
3. **Remaining work** — concrete, scoped items for next time, roughly ordered
   by priority.

Update this file whenever you fix something on the list or find something
new — it's meant to stay current, not to be a one-time snapshot.

---

## 1. Run this after any change

```bash
./scripts/check.sh          # full test suite + coverage (~20-30s)
./scripts/check.sh fast     # skip the slower subprocess-based config tests (~15s)
./scripts/check.sh live     # also boots a real uvicorn and curls it
```

What it does, in order: creates/reuses `.venv`, installs
`requirements-dev.txt`, byte-compiles every module, imports the FastAPI app
(catches wiring mistakes), then runs the test suite. `live` additionally
boots the real server in production mode and checks `/health` and that
`/docs` is off, closer to what actually happens in deployment.

If you don't want the wrapper script:

```bash
source .venv/bin/activate
export PYTHONPATH="$PWD"
python -m pytest tests -q                       # everything
python -m pytest tests -q -m unit               # just tests/unit
python -m pytest tests -q -m "service or api"   # skip config subprocess tests
python -m pytest tests/api/test_splits.py -q    # one file
python -m pytest tests -q --cov=duevia --cov-report=html   # coverage in htmlcov/
```

### Test suite layout

```
tests/
├── sample_data.py     # the ONE shared sample world every layer uses (see below)
├── helpers.py         # Api wrapper, World convenience methods, ledger-invariant checker
├── conftest.py        # fixtures: db_path, conn, client, anon, api, world, bare_world
├── unit/              # pure logic, no DB, no HTTP (money, ledger, enums, time, security,
│                       #   rate limiter, config) -- these should never need a database
├── service/           # application-service + repository tests against a real temp SQLite
│                       #   DB, calling Python functions directly (no HTTP)
└── api/                # full HTTP-level tests through FastAPI's TestClient: auth, every
                        #   resource, STRICT mode, reports, deployment config (CORS/docs/HSTS)
```

**Markers**: `unit`, `service`, `api`, `config` (auto-assigned by directory in
`conftest.py`). `config` tests spawn a subprocess per case (to get a fresh
module import with different env vars) and are the slowest ~1s tests; `fast`
mode skips them.

### The shared sample data

`tests/sample_data.py` defines one small world — owner "Asha Patil" (INR,
`Asia/Kolkata`), 4 accounts (bank, wallet, card, a USD account), 6 categories
(including a parent/child pair and a budget), 2 friends, and one opening
salary deposit. Every test — unit, service, API — that needs a populated
system uses `seed()` from this file, directly or through the `world` /
`bare_world` fixtures. **If you add a new account/category/friend type worth
testing broadly, add it here once** rather than inventing it per-test; every
layer picks it up automatically.

`tests/helpers.py::World` wraps it with readable actions (`world.expense(...)`,
`world.split(...)`, `world.balance("bank")`, `world.friend_balance("rahul")`,
...) so tests read like a description of the scenario, not a wall of
payload-building boilerplate.

### The ledger-invariant checker

Every `api`-layer test automatically runs `assert_ledger_invariants()`
(`tests/helpers.py`) against the SQLite file afterward: every entry has ≥2
postings and balances, no orphan postings, the global trial balance nets to
zero, reversal links point both ways consistently, and posting currency
matches account currency. This is the cheapest way to catch "this new feature
quietly broke double-entry" — if you build something that skips the normal
posting strategies, this check will very likely catch a mistake.

### Writing new tests — where does it go?

- Pure function, no DB, no HTTP → `tests/unit/`.
- Exercises an application service or repository function directly → `tests/service/`,
  using the `ctx` fixture (`tests/service/conftest.py`) for a pre-seeded owner
  + accounts + categories + friends without going through HTTP.
- Anything about a request/response, status codes, auth, or an endpoint's
  behavior → `tests/api/`, using `world`/`bare_world`/`api`/`anon`.
- Anything sensitive to environment variables read at import time (CORS,
  docs exposure, `DUEVIA_ENV`) → `tests/api/test_deployment_config.py`'s
  subprocess pattern; in-process env var changes won't be picked up because
  the FastAPI `app` object is already built.

---

## 2. Known issues / accepted limitations

These were found during review and testing but deliberately left as-is. Each
entry says why, so someone doesn't "fix" it into a worse state, and says what
signal would mean it's time to actually fix it.

| # | Area | Issue | Why left as-is | Revisit when |
|---|---|---|---|---|
| 1 | Rate limiter | In-memory, per-process (`duevia/infrastructure/rate_limiter.py`). Resets on restart; not shared across workers/instances. | Zero extra infra for a single-instance deployment, which is what this ships as. | Running >1 uvicorn worker/instance behind a shared entrypoint. Swap for a Redis-backed limiter or push it to the reverse proxy. |
| 2 | `GET /auth/security-question` | Confirms whether an email has an account (needed to show the right question). A minor enumeration vector. | Inherent to a security-question-based reset flow; the alternative (always show a random question) breaks the feature. It's already rate-limited. | If email enumeration becomes a real concern, replace security questions with an email-link-based reset flow instead. |
| 3 | Pagination | Only `GET /transactions` is paginated (`limit`/`offset` + `{items,total,limit,offset}`). `/accounts`, `/categories`, `/friends`, `/splits`, `/transfers`, `/settlements` return everything. | Fine at personal-finance scale (dozens to low hundreds of rows); wasn't a reported problem. | Any of those lists routinely returns >500 rows for a real user, or a slow query shows up in logs. |
| 4 | `friend_open_balance_accounts` naming | The name suggests "only open (non-zero) balances", but it returns every friend's DUE account regardless of balance (docstring corrected to say so). `statement_service.friend_balances` therefore always lists every friend, including ones settled at 0. | Arguably correct UX (a UI showing "Rahul: 0.00 (settled up)" is reasonable), and changing behavior here is a product decision, not a bug fix. | If a consumer actually wants "only friends with an open balance", add a query parameter rather than changing default behavior, to avoid breaking existing callers. |
| 5 | SQLite as the only backing store | Single-writer; fine at personal-finance scale, and now WAL-mode so reads don't block behind a writer. No connection pool (a fresh connection per request). | Simplicity; nothing in current usage patterns needs more. | Multi-user / high-concurrency write load, or wanting managed backups/replication — swap the `duevia/infrastructure/repositories.py` layer for a Postgres-backed one; nothing above that layer should need to change. |
| 6 | No structured audit log of who-did-what | STRICT mode preserves ledger history (reversal chains), but there's no separate access/audit log of API calls. | Single-owner app; "who" is always the one owner. | If multi-user (see #9) ever happens, add request logging with actor identity. |
| 7 | No OpenAPI-based generated client | Every consumer hand-writes HTTP calls against `docs/API_README.md`. | No consumer has asked for one yet. | A second real UI consumer shows up — generate a typed client from `/openapi.json` at that point rather than guessing at the shape now. |
| 8 | Currency support is a flat 3-letter code, no decimal-places-per-currency table | Everything assumes 2 decimal places (`Money.from_major_units` hardcodes `frac` to 2 digits). Works for INR/USD/EUR etc. but is wrong for 0-decimal currencies (JPY) or 3-decimal ones (BHD, KWD). | No non-2-decimal currency has been requested. | Someone actually needs JPY/BHD/etc. Add a currency → decimal-places table in `duevia/domain/money.py` and thread it through `Money.from_major_units`. |
| 9 | Single owner only (by design, not a bug) | `bootstrap_owner` hard-refuses a second owner; there is no multi-tenant concept anywhere in the schema (no `owner_id` column on `account`/`journal_entry`). | This is the documented, intentional scope of the app (see `ARCHITECTURE_PLAN.md` §1). | A real requirement to support multiple independent owners in one deployment shows up — this is a schema migration (add `owner_id` everywhere) and auth model change, not a small patch; plan it as its own project. |

---

## 3. Remaining work (next steps, roughly prioritized)

### High value, still scoped small
- [ ] **Structured JSON logging with request IDs.** Currently `logging.basicConfig` gives
      plain text. For real production log aggregation, switch to JSON lines and add a
      middleware that assigns/propagates a request ID (useful for correlating a client-reported
      error with server logs, especially for the generic 500 responses).
- [ ] **`Retry-After` header on 429s.** The rate limiter knows the window; the 429 response
      currently doesn't tell the client when to retry. Small addition to
      `duevia/presentation/api/deps.py`'s exception handling.
- [ ] **Pagination on the remaining list endpoints** (see Known Issue #3) — copy the
      `limit`/`offset`/`Page[...]` pattern already used by `GET /transactions`.
- [ ] **`Retry-After`-aware / exponential backoff guidance in docs** for consumers hitting
      the login rate limiter, in `docs/API_README.md`.

### Medium value
- [ ] **A currency-aware decimal-places table** (see Known Issue #8) if/when a non-2-decimal
      currency is needed.
- [ ] **Idempotency keys for POST endpoints.** Currently a retried `POST /transactions/expense`
      after a network blip creates a duplicate entry. An `Idempotency-Key` header + a small
      dedup table would make retries safe. Worth doing before any mobile client ships, since
      mobile networks retry aggressively.
- [ ] **Bulk import.** Every write currently goes through one entry at a time; anyone migrating
      from another tool needs a `POST /transactions/bulk` (or CSV import) endpoint that posts many
      entries in one DB transaction.
- [ ] **Soft-delete / undo for `DIRECT` mode.** Right now `DIRECT` mode deletes are permanent
      (`hard_delete_journal_entry`). Given `STRICT` mode already exists as the audit-preserving
      option, this is a "nice to have," not a gap — but a brief grace-period undo (e.g. redo
      the delete's own postings within N minutes) would reduce a common support request
      ("I deleted the wrong one").

### Lower priority / larger scope
- [ ] **Multi-instance rate limiting** (see Known Issue #1) — only relevant once this is deployed
      as more than one process.
- [ ] **Multi-owner / multi-tenant support** (see Known Issue #9) — a deliberate non-goal today;
      revisit only if the product scope actually changes.
- [ ] **Swap SQLite for a server database** (see Known Issue #5) — only if concurrency/backup
      needs outgrow SQLite+WAL; the repository layer is intentionally the only place this would
      touch.
- [ ] **Generated typed API client** (see Known Issue #7) — once there's a second real consumer.

### Housekeeping
- [ ] **CI.** There's no CI configuration yet (this environment couldn't add GitHub Actions
      directly). Wire `./scripts/check.sh` into whatever CI the team uses; it already exits
      non-zero on any failure and is deterministic (bcrypt cost is dropped to 4 rounds under
      test, rate limiters reset between tests, everything runs against a fresh temp SQLite file).
- [ ] **Pin dependency versions exactly** (`requirements.txt` currently uses `>=`). Fine for an
      actively developed project; consider `pip freeze`-style pinning (or a lockfile) once this
      is deployed somewhere that needs reproducible builds.
- [ ] **Coverage is ~97%** (`./scripts/check.sh` prints the report). The remaining ~3% is mostly
      defensive branches that are hard or undesirable to hit in a test (e.g. the `/health`
      endpoint's DB-connection-failure path, the "friend has no DUE account" data-integrity
      guard in `friends.py`). Not flagged as a gap; re-check the report after major changes to
      make sure new code doesn't silently lower it.
