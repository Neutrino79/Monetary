# 22 -- Testing and parity

> **ID** MP-22 · **Status** Draft · **Depends on** -- (the first package to start) · **Unblocks** MP-11 and confidence in everything

**Agent brief.** Build the safety net before the rewrite: a recorder that captures request/response pairs from the *current*
Python backend for many realistic scenarios, and a replayer that runs the same scenarios against the new `packages/api` and reports differences.
Then own the shared test infrastructure (driver conformance, e2e, device smoke) and the performance benchmarks. Without this document done first,
"identical behavior" is a hope, not a fact.

## Context

The Python backend has a large test-suite (`backend/tests/`: unit, service, infrastructure, api, deployment, tooling, with shared sample data in `backend/tests/support/`) and a
>= 95% coverage rule. Those tests port to TypeScript (MP-11), but ported tests only prove the port matches *the author's reading* of the old tests. Recorded
fixtures prove the port matches *the actual old behavior*, including report math and ordering.

## Test pyramid

| Layer | Where | Runs |
|---|---|---|
| Unit (pure domain) | `packages/core/**/domain` | every PR |
| Service (core + in-memory SQLite) | `packages/core/**/application` | every PR |
| Driver conformance (same suite, 3 drivers) | `packages/core/src/storage/conformance` | node + wasm: every PR; Android emulator: nightly + PRs touching `mobile/`/`sqlite-capacitor` |
| API (`app.request`, no sockets) | `packages/api` | every PR |
| **Parity replay** (recorded v0.5 fixtures) | `tests/parity/` | every PR |
| Server integration (real HTTP, temp DB) | `server/` | every PR |
| Web unit/component (existing 207 tests) | `web/` | every PR |
| Web e2e (Playwright: local mode, cloud mode, offline, a11y, phone viewports) | `web/e2e/` | every PR (small set), nightly (full) |
| Android smoke (emulator) | `mobile/` | nightly + `mobile/` PRs |
| Performance benchmarks | `tests/perf/` | nightly; results as artifacts; regressions flagged |

## Parity: fixture recorder and replayer

**Scenario** = a script of API steps against a fresh instance, written in a small declarative format (YAML/JSON):

```yaml
name: split-and-settle
steps:
  - call: POST /setup/init
    body: { name: Test, email: t@example.com, currency: INR, timezone: Asia/Kolkata, password: ..., securityQuestionId: 1, securityAnswer: x }
    save: { token: $.access_token }
  - call: POST /accounts
    body: { name: HDFC, type: ASSET, ... }
    save: { hdfc: $.id }
  - call: POST /transactions
    body: { type: split, accountId: "{{hdfc}}", ... }
  - call: GET /reports/dashboard?month=2026-10
```

- The **recorder** (`tests/parity/record.py`, Python, run against `backend/`) executes scenarios against a throw-away database with a **frozen clock** (monkeypatch `utc_now_iso` and `local_today`)
  and writes `tests/parity/fixtures/<scenario>.json` containing every request and response.
- **Id normalization**: integer ids become stable placeholders by first appearance (`{acct:1}`, `{entry:3}`); the replayer maps placeholders to the new UUIDs. This is the declared Q2 difference.
- The **replayer** (`tests/parity/replay.test.ts`, Vitest) runs each scenario against `createApi` (in-memory driver, same frozen clock) and compares responses after normalization:
  exact for integers/strings/booleans/arrays, **tolerance 1e-9 relative (or 1 point for rounding documented cases)** for floating report values; key order ignored; known differences
  applied from `parity-exceptions.md`.
- **Coverage of scenarios** (minimum, grow over time): setup/auth/owner; every account type and subtype incl. credit-card statements; categories and subcategories; each transaction type
  (income, expense, transfer, split, fronted, settlement, refund, adjustment); edits and deletes in both DIRECT and STRICT modes; refunds and over-refund conflict; settlement-history guard and `force`; tags (all rules);
  friends and balances, fronted/unpaid allocation order; filters, sort, `groupBy` for every key and paging across group boundaries; every report endpoint at several months including partial months, DST boundaries, and empty ledgers;
  error contract for each `error_type`; rate-limit behavior; timezone variety (`Asia/Kolkata`, `America/New_York` across DST, `Pacific/Auckland`).
- **Fixture hygiene**: scenarios use invented data only; fixtures are generated, committed, and reviewed in diffs; regenerating requires the Python backend at a pinned commit recorded in `tests/parity/README.md`.

## Other requirements

1. **Frozen clock + injected ids** in every test: no real time, no random ids (use a deterministic UUIDv7 generator).
2. **Timezone matrix**: core tests run under at least two non-UTC host `TZ` values in CI.
3. **Property tests** (fast-check or similar, FOSS): money parse/format round-trip; any generated valid entry balances; paging reassembles to the full list; archive round-trip.
4. **Coverage**: `packages/core` and `packages/api` >= 95% lines; existing backend rule stays until Python is removed.
5. **Performance benchmark** `tests/perf/`: generate a deterministic ledger of 50,000 entries and 20 accounts; measure dashboard report, a 500-row filtered list, group totals, export, import; run on Node, in the browser (wasm) and on an Android emulator/device; publish a table. Budgets are set from the spike (MP-26).
6. **Flake policy**: a flaky test is fixed or quarantined with an issue within a week; never retry-until-green in CI.
7. **No weakening**: `AGENTS.md` rule 4 applies -- never disable, skip or loosen a test to get green.

## Tasks

- [ ] Write the scenario format + schema and the Python recorder; run it against `backend/` at a pinned commit; commit fixtures. (Can start immediately; no TS needed.)
- [ ] Write ~30 scenarios covering the list above; get the owner or a reviewer to skim them for realism.
- [ ] Write the replayer and normalization; initially run it against a stub that fails everything, so the harness itself is trusted.
- [ ] Add `parity-exceptions.md` (format: id, area, v0.5 behavior, v1 behavior, reason, approved-by).
- [ ] Create the driver conformance suite scaffold (the cases are listed in MP-12) and the shared Vitest workspace config.
- [ ] Add Playwright setup in `web/e2e/` with fixtures for local mode and cloud mode; add axe a11y checks.
- [ ] Add the benchmark generator and runner; store results as CI artifacts.
- [ ] Add CI jobs (`parity`, `e2e`, nightly `android`/`perf`).

## Acceptance criteria

- Recorder is deterministic: running it twice yields byte-identical fixtures.
- The replayer fails loudly (non-zero, readable diff) when a response differs and passes when run against the Python backend through a thin HTTP adapter (self-test proving the harness itself is correct).
- At least 30 scenarios and every endpoint in `docs/API.md` appear in at least one scenario (a script lists uncovered endpoints and CI fails if any).
- CI runs parity on every PR in under ~5 minutes.

## Files you may touch

`tests/parity/**`, `tests/perf/**`, `web/e2e/**`, shared test config, `docs/multi-platform/parity-exceptions.md`, CI workflow files for these jobs. Read-only access to `backend/`.

## Out of scope

Fixing Python bugs, changing behavior, mutation testing, load testing servers.

## Verification

```bash
python tests/parity/record.py --check      # re-records to a temp dir and diffs against committed fixtures
npm run test:parity
npm run test:e2e
```
