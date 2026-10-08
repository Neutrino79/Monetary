# Integration checklist — `production-app` ⇄ Python backend

Living document, updated with every commit on `feat/monetary-integration`.
Legend: `[x]` done and verified · `[~]` done, verification pending · `[ ]` not started.

**Decisions in force:** single owner (one-time setup) · camelCase API · numeric IDs · money as `{points, major, currency}` ·
all calculations server-side · flat `/transactions` layer over the untouched double-entry core · calendar-month reporting ·
no DB migrations (schema edited directly; delete any pre-existing dev database) · product name configurable.

## 0. Baseline
- [x] Backend baseline: 395 tests passing before any change
- [x] Frontend baseline: typecheck clean, 19 vitest tests passing before any change

## 1. Application name ("Monetary", configurable)
- [x] Backend: `app_name()` / `app_tagline()` read `DUEVIA_APP_NAME` / `DUEVIA_APP_TAGLINE` (default Monetary)
- [x] Backend: public `GET /meta` (name, tagline, version, apiVersion); OpenAPI title + root response use it
- [x] Backend: tests (default, override, blank fallback)
- [x] Frontend: `useBranding()` reads `/meta`; `VITE_APP_NAME` is only the pre-load fallback (default Monetary)
- [x] Frontend: branding used in auth shell, sidebar, topbar, guards, settings, signup, document title
- [ ] `index.html` title/description + favicon use the configured name (static fallback)
- [ ] README / API docs describe the product as Monetary

## 2. Authentication & first-run setup
- [x] `GET /setup/status` (public) → `{initialized}`
- [x] `POST /setup/init` re-checks atomically (409), optional `seedDefaults`
- [x] Setup page checks status first; "already set up" panel with Sign in / Forgot password
- [x] Login redirects to setup until the owner exists; no "create account" link
- [x] Bad credentials → 401 (+ `WWW-Authenticate`)
- [x] Login via OAuth2 form; token stored; owner hydrated from `GET /owner`
- [x] Owner output: `isSuperuser`, `securityQuestionId`, `createdAt`, `updatedAt`
- [x] Security questions fetched from backend (frontend list removed — the two lists disagreed)
- [x] Password reset via `GET /auth/security-question` + `POST /auth/reset-password`
- [x] Global 401 handling (session expired → login, message shown); network errors don't log you out
- [x] Change-password UI in Settings
- [x] Server-side logout

## 3. Backend API
- [x] Shared camelCase base model for every schema (OAuth token stays snake_case per spec)
- [x] Schema edits (no migrations): `account.subtype/credit_limit/statement_day/color`, `user.phone`, `journal_entry.correction_of_id`
- [x] `docs/LIVE_SCHEMA.sql` regenerated
- [x] Accounts: PATCH, reactivate, subtype, **credit limit / statement day LIABILITY-only**, `balance` in list
- [x] Accounts: opening balance on create only, posted as an "Opening balance" ADJUSTMENT
- [x] Categories: PATCH (name/colour/budget/reparent), reactivate, colour, `?type=` filter (income sources)
- [x] Default categories & income sources seeded at setup — configurable (`seed_defaults.json`, `DUEVIA_SEED_DEFAULTS_PATH`)
- [x] Friends: phone, PATCH name/email/phone (clear vs unchanged), createdAt
- [x] Flat `/transactions`: create / read / patch / delete for every type, dispatching to existing services
- [x] Server-side filter (type, account, category subtree, friend, search, dates), sort, paging
- [x] `dateTo` inclusive (old behaviour dropped the whole end day)
- [x] Clearable memo; future-date check; exact split-total validation; settlement direction verified
- [x] STRICT mode: `correctionOf` / `replacedBy` links; REVERSAL rows hidden from the flat API
- [x] FRONTED type supported in API (no UI yet — by decision)
- [x] Transfer memo supported
- [x] Reports typed + camelCase; dashboard `summary`, `friendTotals`; per-subcategory breakdown
- [x] Raw postings still available at `GET /transactions/{id}/postings`
- [x] Backend tests: 481 passing (395 existing updated + 86 new)

## 4. Frontend
- [x] HTTP layer: FastAPI error parsing (`detail`, 422 field errors), 401 handler, timeout, form login
- [x] Domain types + wire DTOs + mappers (money, nullable → optional)
- [x] Services call the real API only (no mock branches)
- [x] Hooks: server-driven queries, one ledger-wide invalidation after any mutation
- [x] Pages: Login, Signup (setup), Forgot password, Accounts, Categories (+income sources, archive), Friends, Settings, Dashboard, Reports, Splits
- [x] Calendar-month dashboard/reports with month selector
- [~] `TransactionTable` server-driven (done, awaiting integration test)
- [ ] `TransactionForm` (create/edit all types, numeric IDs, exact split validation, no `ledgerMode`, no `settled`)
- [ ] `TxnDetailDrawer` (server data, STRICT links, 409 force-confirm for guarded splits, `fronted` read-only)
- [ ] `src/test/app.test.tsx` rewritten (old tests asserted on the removed mock DB)
- [ ] `tsc`, `oxlint`, `vitest`, `vite build` all clean
- [x] Client-side calculations removed (`ledgerCalculations.ts`, `useLedgerCalc.ts`)
- [x] Mock API removed (it can't represent the new contract)
- [x] Date bugs fixed: local-calendar `today()`; no UTC month-boundary math

## 5. End-to-end verification (UI → HTTP → Python → SQLite)
- [ ] Live-uvicorn integration test harness (temp DB)
- [ ] Setup → login → accounts → categories
- [ ] Expense / income / transfer / split / settlement / refund
- [ ] Edit & delete in DIRECT and STRICT
- [ ] Dashboard & report numbers vs. hand-computed values
- [ ] Logout / expired token
- [ ] Branding changes via `DUEVIA_APP_NAME`

## 6. Docs & delivery
- [ ] README: run instructions, env vars (`DUEVIA_APP_NAME`, `DUEVIA_CORS_ORIGINS`, `VITE_API_BASE_URL`)
- [ ] `.env.example` files updated
- [ ] Final diff review; secret scan
- [ ] Pull request opened against `main`

## Notes
- Existing dev databases from before this branch must be deleted: the schema gained columns and there is no migration (agreed).
- Backend test count: 395 → 481.
