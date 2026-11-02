# 26 -- De-risking spike (1-2 weeks, before the rewrite)

> **ID** MP-26 · **Status** Draft · **Depends on** MP-00, MP-01 · **Unblocks** MP-11 (go/no-go) and ADR-0003/0004

**Agent brief.** Run time-boxed experiments that answer the few questions that could invalidate the architecture, record **numbers**, and
write the outcome into the ADRs. Spike code is throwaway: put it on a `spike/*`-style branch (`chore/spike-<topic>`), do not merge it to `main`, and do not
polish it. Only the written results are kept. Stop at the time box even if results are incomplete and report what is missing.

## Questions and pass/fail bars

| # | Question | Experiment | Pass bar | If it fails |
|---|---|---|---|---|
| S1 | Can Android local mode be fast enough through a Capacitor SQLite plugin? | Generate 50k entries + postings (script from MP-22 perf). On a mid-range physical Android (and an emulator) run: insert in batches, list 500 filtered rows, dashboard aggregates, a heavy trends report, export. Compare candidate plugin (a) community plugin vs (b) minimal in-repo plugin over framework SQLite. | Dashboard <= 700 ms; list <= 150 ms; batch insert 50k <= 60 s; no ANR; UI stays smooth | Move aggregates fully into SQL; add batching; try the other plugin; as a last resort reconsider RN/native driver (ADR-0002 amendment) |
| S2 | Does the framework SQLite on our minSdk have the features we need? | Check `sqlite_version()` and test `RETURNING`, window functions, JSON1, STRICT, FK, WAL on emulators from API 26 up | All required features present on the chosen minSdk | Raise minSdk or bundle SQLite via a FOSS AAR (re-run S1) |
| S3 | (dropped) Browser local mode | Out of scope: the web app is server-backed (ADR-0008). Number kept so references stay stable. | -- | -- |
| S4 | Can TypeScript reproduce Python report math? | Port `report_analytics.py`, `spending_pace.py` and one report (e.g. `GET /reports/overview`) and replay 5 fixtures | Equal within the tolerance in MP-22 on all fixtures, under three host time zones | Study the divergence (float ops, percentile definition, rounding); decide to match or document |
| S5 | Is the timezone/date layer correct on every runtime? | Implement the 7 helpers on `Intl`; test DST gaps/overlaps, month bounds, `Asia/Kolkata`, `America/New_York`, `Pacific/Auckland`, `Australia/Lord_Howe` against the Python outputs | 100% match on a table of >= 200 generated cases, in Node, Chromium, Android WebView, Safari | Use a small FOSS tz library or the Temporal polyfill (size check) |
| S6 | Does the in-process API work (no socket) and is the bundle size OK? | `createApi` with Hono-style `fetch`; call via `InProcessTransport` from the mobile build (`VITE_TARGET=mobile`); measure gzip size of core+api+zod | Mobile local-runtime bundle <= ~1.5 MB gzip; cold start <= 2.5 s on mid-range Android | Lazy-load local runtime; drop heavy deps; reconsider the framework |
| S7 | CORS vs native HTTP from the WebView | From a Capacitor app, call a Docker server over HTTPS and over `http://<LAN-IP>`; try WebView `fetch` and CapacitorHttp; record behavior with self-signed certs, private ranges, and cleartext config | One approach that works for HTTPS and private-range HTTP without disabling security | Keep CapacitorHttp, or add the native-origin CORS option (MP-14 req. 4) |
| S8 | Is the Capacitor project F-Droid-buildable? | Build with only FOSS plugins in a clean container using Gradle offline-style steps; list all Gradle/Maven artifacts and their licenses; check for any prebuilt non-source binaries; check 16 KB alignment with the required tool **(verify)** | No proprietary artifacts; builds from source; alignment passes | Replace/inline the offending plugin; document exceptions with F-Droid maintainers |
| S9 | Node SQLite choice for the server | Compare `node:sqlite` vs `better-sqlite3` on the same benchmark and on stability/maintenance/Docker simplicity **(verify `node:sqlite` status in the Node LTS we target)** | A choice with no native-addon pain, within 2x of the faster | Pick `better-sqlite3` and bundle prebuilt binaries per arch |
| S10 | Password hashing parameters | Benchmark scrypt params on a 1 vCPU VPS and an ARM SBC | Verify <= ~250 ms per hash at chosen params | Lower N within recommended minimums |

Optional (only if S1 fails): S11 React Native/Expo feasibility (Hermes `Intl`/timezone correctness, SQLite speed) as an *alternative shell*; the layered structure makes this possible without redoing core.

## Deliverables

1. `docs/multi-platform/spike-report.md`: one table row per S-item with measured numbers, devices/emulators used, pass/fail and the decision.
2. ADR-0003 (drivers) and ADR-0004 (ids/money/time) moved from *Proposed* to *Accepted* or revised; ADR-0001/0007 confirmed or amended.
3. Final values for: minSdk (Q10), performance budgets (MP-20/22), required SQLite version, mobile HTTP approach, Node SQLite choice, hash params.
4. A go/no-go recommendation to the owner, with the top three remaining risks.
5. The recorded benchmark generator and the device list, so results are reproducible.

## Rules

- Time-box: 5-10 working days. If S1 is inconclusive at day 5, report immediately.
- Measure on **real hardware** for S1, S7 (not only emulators); state the device model and Android version in the report.
- Do not leave spike code in `packages/`; copy only the reusable harnesses (benchmark generator, conformance cases) into the proper packages via normal PRs.
- No secrets, no personal data in spike data; synthetic ledger only.

## Tasks

- [ ] S4 first (no devices needed; depends on fixtures from MP-22).
- [ ] S5, S9, S10 (Node and browsers only).
- [ ] S6 (bundle size and the in-process API in the Android WebView build).
- [ ] S2, S1, S7, S8 (Android).
- [ ] Write the report; update ADRs and open questions; present the go/no-go.

## Acceptance criteria

- Every S-item has a measured result or an explicit "not run, because" line.
- The report is reproducible by someone else from the repository (scripts + device list).
- ADR statuses updated; Q10 and the budgets filled in.

## Files you may touch

`docs/multi-platform/spike-report.md`, `docs/multi-platform/adr/**`, `docs/multi-platform/02-open-questions.md`, and the throwaway branch only.
