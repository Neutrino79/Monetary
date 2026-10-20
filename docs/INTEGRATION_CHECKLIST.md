# Integration checklist — `production-app` ⇄ Python backend

Final state of `feat/monetary-integration`. Legend: `[x]` done and verified · `[~]` done, with a caveat noted.

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
- [x] Frontend: branding used in auth shell, sidebar, topbar, guards, settings, signup, document title/favicon
- [x] `index.html` title/description + favicon use the configured name (static fallback, filled at build time)
- [x] README / API docs describe the product as Monetary

## 2. Authentication & first-run setup
- [x] `GET /setup/status` (public) → `{initialized}`
- [x] `POST /setup/init` re-checks atomically (409), optional `seedDefaults`
- [x] Setup page checks status first; "already set up" panel with Sign in / Forgot password
- [x] Login redirects to setup until the owner exists; no "create account" link
- [x] Bad credentials → 401 (+ `WWW-Authenticate`)
- [x] Login via OAuth2 form; token stored **before** the owner is loaded (found by the live run)
- [x] Owner output: `isSuperuser`, `securityQuestionId`, `createdAt`, `updatedAt`
- [x] Security questions fetched from backend (frontend list removed — the two lists disagreed)
- [x] Password reset via `GET /auth/security-question` + `POST /auth/reset-password`
- [x] Global 401 handling (session expired → login, message shown); stale tokens dropped at startup; network errors don't log you out
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
- [x] Server-side filter (type, account, category subtree, friend, refundOfId, search, dates), sort, paging
- [x] `dateTo` inclusive (old behaviour dropped the whole end day)
- [x] Clearable memo; future-date check; exact split-total validation; settlement direction verified
- [x] STRICT mode: `correctionOf` / `replacedBy` links; REVERSAL rows hidden from the flat API
- [x] FRONTED type supported in API (no UI yet — by decision)
- [x] Transfer memo supported
- [x] Reports typed + camelCase; dashboard `summary`, `friendTotals`; per-subcategory breakdown
- [x] Raw postings still available at `GET /transactions/{id}/postings`
- [x] Backend tests: **485 passing** (395 existing updated + 90 new)
- [x] **Found by the live integration run (invisible to the in-process TestClient):**
  - [x] SQLite connection used across worker threads → intermittent 500s (`check_same_thread=False`, regression test)
  - [x] DB commit ran *after* the response was sent → a client's next request could read stale data (function-scoped dependency, regression test)

## 4. Frontend
- [x] HTTP layer: FastAPI error parsing (`detail`, 422 field errors), 401 handler, timeout, form login
- [x] Domain types + wire DTOs + mappers (money, nullable → optional)
- [x] Services call the real API only (no mock branches)
- [x] Hooks: server-driven queries, one ledger-wide invalidation after any mutation
- [x] Pages: Login, Signup (setup), Forgot password, Accounts, Categories (+income sources, archive), Friends, Settings, Dashboard, Reports, Splits, Transactions family
- [x] Calendar-month dashboard/reports with month selector (the dashboard endpoint takes one `month=YYYY-MM` param — found by the live run)
- [x] `TransactionTable` server-driven (a UI-created expense appears in the list — integration-tested)
- [x] `TransactionForm` (all types, numeric IDs, exact-to-the-cent split validation, server errors inline, force-confirm for guarded splits)
- [x] `TxnDetailDrawer` (server data, STRICT links, refunds via filter, force-confirm, `fronted` read-only, no per-split settled)
- [x] Client-side calculations removed (`ledgerCalculations.ts`, `useLedgerCalc.ts`)
- [x] Mock API removed (it can't represent the new contract); hard-coded security questions removed
- [x] Date bugs fixed: local-calendar `today()`; no UTC month-boundary math
- [x] Old `app.test.tsx` (asserted on the removed mock DB) replaced by a route smoke test; plus unit, stubbed-network UI and live integration suites
- [x] `tsc` clean · `oxlint` 0 errors (7 style warnings) · `vitest` **32 passing** (12 route smoke + 8 UI + 12 unit) · `vite build` OK

## 5. End-to-end verification (UI → HTTP → Python → SQLite)
- [x] Live-uvicorn integration harness (temp DB, deterministic file order, port-in-use guard): `npm run test:integration` — **25 passing**
- [x] Setup → login → accounts → categories (seeded defaults, income sources)
- [x] Expense / income / transfer / split / settlement / refund (balances hand-checked)
- [x] Edit & delete in DIRECT and STRICT (correction link, reversed original hidden)
- [x] Dashboard & report numbers vs. hand-computed values
- [x] Logout / revoked session / wrong password / password reset
- [x] Branding served by the backend (`/meta`); renaming covered by backend tests (`DUEVIA_APP_NAME`)

## 6. Docs & delivery
- [x] README: run instructions, env vars (`DUEVIA_APP_NAME`, `DUEVIA_CORS_ORIGINS`, `VITE_API_BASE_URL`), tests
- [x] `.env.example` updated
- [x] Backend and frontend sources pushed to the branch and byte-compared against the locally tested tree (git blob hashes) for the backend
- [x] Pull request opened against `main` (never pushed to `main` directly)
- [ ] **Recommended merge method: squash** — the branch history is one commit per area plus a few single-file removals

## Known limitations / follow-ups
- **FRONTED** ("paid by friend") exists in the API and renders read-only in the UI; there is no creation form yet (by decision).
- **Single display currency**: reports are per currency on the backend; the UI shows the owner's home-currency bucket.
- **Browser E2E (Playwright) was not run**; the end-to-end suite drives the real React app in jsdom against a live server.
- **Existing dev databases must be deleted** — the schema gained columns and there is no migration (agreed).
- The session token lives in `localStorage` (unchanged from before); an httpOnly cookie would be a later hardening step.
- Backend tests 395 → 485; frontend tests 19 → 32 (+25 live integration).
