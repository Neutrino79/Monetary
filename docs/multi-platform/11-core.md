# 11 -- Core: domain rules and application services

> **ID** MP-11 · **Status** Draft · **Depends on** MP-10, MP-22 (fixtures) · **Unblocks** MP-12, 13, 14, 19

**Agent brief.** Port the Python ledger logic to TypeScript in `packages/core` with **identical behavior**.
Work module by module in the order below. Each module is its own small PR containing the TypeScript code,
its tests (ported from `backend/tests/` plus parity fixtures) and nothing else. Do not change behavior,
do not improve rules, do not add features. If you find a bug in the Python code, record it in
`docs/multi-platform/parity-exceptions.md` and keep the old behavior until the owner decides.

## Context

The Python backend (about 6.6k lines) is the specification. Its layers are `domain/` (pure),
`application/` (services), `infrastructure/` (SQL), `presentation/` (HTTP). The core takes the first three
(SQL moves to `core/storage`, covered by MP-12) and the HTTP layer becomes `packages/api` (MP-13).

Behavior-critical facts to preserve:

- Money is an **integer number of points** (2-decimal minor units). Amounts in requests are decimal
  strings; floats are rejected. Postings have non-negative `debit_amount`/`credit_amount`, exactly one non-zero.
- Every entry must balance (sum of debits = sum of credits) per the double-entry rules in `domain/ledger.py`.
- The owner has a timezone; entry dates are local calendar dates stored as UTC instants; months and days follow the owner's timezone.
- Two ledger modes: **DIRECT** edits in place; **STRICT** posts a replacement and a reversal (`correctionOf` / `replacedBy`).
- Reports (dashboard, trends, overview, categories, compare, budget-history, outlook, spending-pace) are computed
  server-side; the web app only renders them.

## Requirements

1. Same inputs give same outputs as the Python code for every recorded fixture, up to documented exceptions.
2. **Integer money only.** Use JavaScript `number` restricted to safe integers (`Number.isSafeInteger`); reject anything
   larger with the same `MoneyError`. (ADR-0004. About 9e13 major units, far above any personal ledger.)
3. **No floating-point money math.** Percentages, rates and standard deviations used by reports are floats
   in Python too; port formulas identically and compare with a tolerance (MP-22), never use floats for stored amounts.
4. **Time** must not depend on the host's local zone. Implement the 7 helpers of `domain/time_utils.py`
   (`validate_timezone`, `parse_local_to_utc_iso`, `utc_iso_to_local_date`, `local_today`,
   `next_local_day_start_utc_iso`, `current_year_month`, `month_bounds_utc_iso`) on `Intl.DateTimeFormat`
   with an IANA zone, behind one module. Take "now" from an injected `Clock` so tests are deterministic.
   DST-edge cases (ambiguous or skipped local times) must behave exactly as Python's `zoneinfo` does in the fixtures. **(verify in spike MP-26)**
5. Domain errors are the same classes and names (`NotFoundError`, `ValidationError`, `MoneyError`, `ConflictError`,
   `AuthenticationError`, `OwnershipError`, `RateLimitError`) so the API maps them to the same `error_type` strings.
6. The core takes **no I/O dependencies except ports**: `SqlDriver` (MP-12), `Clock`, `IdGenerator`, `Hasher` (password/answer hashing, implemented per runtime).
7. Services are plain functions or small classes taking a `Context { db, clock, ids, hasher }`. No global state, no singletons.
8. Every service operation runs inside a single database transaction (see MP-12), and commits before returning (read-your-writes).

## Module map (port in this order)

| # | Python source | TypeScript target (`packages/core/src/...`) | Notes |
|---|---|---|---|
| 1 | `domain/exceptions.py` | `domain/errors.ts` | class names preserved |
| 2 | `domain/enums.py` | `domain/enums.ts` | string unions + const arrays |
| 3 | `domain/money.py` | `domain/money.ts` | `Money`, parse decimal string -> points, format, signed format |
| 4 | `domain/time_utils.py` | `domain/time.ts` | Intl-based; injected clock |
| 5 | `domain/ledger.py` | `domain/ledger.ts` | legs, intents, balance check |
| 6 | `domain/tags.py` | `domain/tags.ts` | normalization rules (trim, lowercase, drop `#`, <=30 chars, no commas) |
| 7 | `domain/security.py` | `domain/security.ts` | question list; normalization of answers; hashing via `Hasher` port |
| 8 | `domain/spending_pace.py`, `domain/report_analytics.py` | `domain/pace.ts`, `domain/analytics.ts` | float math; tolerance in tests |
| 9 | `infrastructure/repositories.py`, `tag_repository.py`, `transaction_queries.py` | `storage/*` | belongs to MP-12; ported together with the service that needs it |
| 10 | `application/ledger_service.py`, `user_service.py`, `seed_service.py`, `account_service.py` | `application/*` | owner, accounts, categories, seeding |
| 11 | `application/transaction_service.py`, `flat_transactions.py`, `transaction_view.py`, `tag_service.py` | `application/*` | flat transaction API, views |
| 12 | `application/transfer_service.py`, `split_service.py`, `settlement_service.py` | `application/*` | friend flows; fronted expenses and settlement allocation order |
| 13 | `application/budget_service.py`, `statement_service.py`, `reconcile_service.py`, `dashboard_service.py`, `trends_service.py`, `reports_service.py` | `application/*` | reports; port last, they depend on everything |

The JSON seed `backend/monetary/seed_defaults.json` moves to `packages/core/src/seed/defaults.json`
(the same file, so seeds stay identical).

## Design notes

- **Services and storage**: services call typed repository functions from `core/storage`; they never write SQL themselves.
- **Validation**: request validation (shapes, enums) is in `contract` schemas and runs in `api`. Business-rule validation (currency
  mismatch, over-refund, settlement-history guard) stays in the services, as in Python.
- **Ordering**: list endpoints must give a deterministic order. Where Python relied on `AUTOINCREMENT` id order as a tiebreaker, define
  the explicit tiebreaker `(entry_date, created_at, id)` and record the exception in `parity-exceptions.md` if fixtures differ.
- **Hashing**: the `Hasher` port has `hash(secret)` and `verify(secret, hash)`. Server uses scrypt (MP-14/18). Local mode needs no password
  hashing unless the user enables an app-lock PIN (a UI gate; see MP-18).
- **Rate limiting** (`infrastructure/rate_limiter.py`) is a server concern; it goes to `packages/api` as middleware (MP-13), not core.
- **No `any`** in exported types. Types for requests/responses come from `contract`.

## Tasks

- [ ] Create `packages/core` structure: `domain/`, `application/`, `storage/`, `seed/`, `index.ts`, `testing/` (test helpers: in-memory driver wiring, sample data).
- [ ] Port each module in the order above, one PR per row (rows 1-8 may be grouped into 2-3 PRs).
- [ ] For each ported Python test in `backend/tests/unit` and `backend/tests/service`, add the equivalent Vitest test in the matching folder; reuse the sample data from `backend/tests/support/sample_data.py` (port it to `testing/sampleData.ts`).
- [ ] Wire each module into the parity harness from MP-22 as soon as the matching fixtures exist.
- [ ] Maintain `docs/multi-platform/parity-exceptions.md`: every intentional difference with reason and owner sign-off.
- [ ] Keep coverage of `packages/core` >= 95%.

## Acceptance criteria

- All ported unit and service tests pass; every recorded parity scenario passes (MP-22) or has a signed-off exception.
- `domain/` has zero imports from outside itself (boundary check passes); no Node-only built-ins in `core`.
- Running the whole core test-suite under a different host timezone (`TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`) gives identical results.
- A fuzz/property test proves double-entry balance for all generated entries and that money parsing round-trips.
- Coverage >= 95% for `packages/core`.

## Files you may touch

`packages/core/**`, `docs/multi-platform/parity-exceptions.md`, the matching test folders.
Never edit `backend/` except to read it.

## Out of scope

HTTP routes (MP-13), SQL drivers (MP-12), UI changes, any behavior change, multi-currency, new report types.

## Verification

```bash
npm run typecheck -w @monetary/core && npm test -w @monetary/core -- --coverage
TZ=Pacific/Auckland npm test -w @monetary/core
npm run test:parity   # from MP-22
npm run check:boundaries
```
