# 25 -- Roadmap and milestones

> **ID** MP-25 · **Status** Draft · **Depends on** all · **Unblocks** planning

**Agent brief.** This document orders the work. Use it to decide what can start now, what must wait, and what "done" means for a milestone.
Estimates are rough effort for one focused engineer or agent and exist only to compare chunks; they are **not** commitments.

## Milestones

| M | Name | Packages | Exit criteria | Rough effort |
|---|---|---|---|---|
| **M0** | Decisions and safety net | 02, ADRs, 22 (recorder + scenarios), 24 (license choice, community files) | Owner answered Q1-Q8; fixtures recorded and deterministic; plan merged | 1-2 weeks |
| **M1** | De-risking spike | 26 | All spike pass/fail bars recorded in ADR-0003/0004 and a report; go/no-go | 1-2 weeks |
| **M2** | Foundations | 10 (including the repo restructure to `apps/` + `packages/`), 22 (replayer, conformance scaffold) | Workspaces build, boundaries enforced, CI green, replayer proven against Python | 1 week |
| **M3** | Core parity | 11, 12 (node driver) | All domain + service modules ported; parity scenarios (non-report) pass | 4-6 weeks |
| **M4** | Reports parity + API | 11 (reports), 13 | All parity scenarios pass; OpenAPI committed; API tests >= 95% | 3-4 weeks |
| **M5** | Server | 14 | Docker image works; web integration tests pass on the Node server; self-hosting doc including the "run it on your own computer" path | 1-2 weeks |
| **M6** | Web on the new stack | 15, 16 (fonts, Platform, back button), 19 (export/import) | Web UI runs against the Node server (served by it and standalone); ids are strings; Platform layer in place; no third-party requests | 3-4 weeks |
| **M7** | Onboarding and modes | 17, 18 (app lock, logging, audits) | Mode picker, URL validation, switching, backups; a11y checks pass | 2 weeks |
| **M8** | Android | 20, 12 (capacitor driver) | Debug/release APKs; emulator smoke green; budgets measured | 3-4 weeks |
| **M9** | Cut-over and cleanup | -- | Python backend deleted; `AGENTS.md`/docs reflect the TS stack; `docs/API.md` is v1 | 1 week |
| **M10** | Public launch | 23, 24 | Signed release; F-Droid recipe accepted or in review; Play internal/closed test live; repo public | 2-4 weeks (store reviews are outside our control) |
| **M11** | iOS (later) | 21 | per its task list | 3-5 weeks after approval |

Sequence: M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7 -> M8 -> M9 -> M10. Some overlap is intended (see lanes). Total to a public Android + web release is roughly **5-7 months** for one person; parallel lanes shorten it.

## Parallel lanes

After M2, independent lanes can run at once with little merge conflict because they own different paths.

| Lane | Packages | Owns paths | Needs from others |
|---|---|---|---|
| **A: Core** | 11, 12 (storage, node driver) | `packages/core`, `packages/sqlite-node` | fixtures (22) |
| **B: Contract and API** | 13, 14 | `packages/contract`, `packages/api`, `apps/server/` | core services as they land (stubs until then) |
| **C: Client and UI** | 15, 16, 17, 19 (UI) | `packages/client`, `apps/web/src/platform`, `apps/web/src/features` | the contract schemas (B), local runtime (A+B) |
| **D: Mobile** | 12 (capacitor driver), 20 | `packages/sqlite-capacitor`, `apps/mobile/` | Platform port (C), conformance suite (A) |
| **E: Open source and release** | 24, 23, 18 (docs/CI parts) | repo root files, `.github`, `docs/` | owner decisions (02) |

Branch model, waves, merge order and test gates for running many agents at once are in [`28-parallel-delivery.md`](28-parallel-delivery.md). Rules for parallel work: a lane touches only its paths; cross-lane contracts (the `contract` package, `SqlDriver`, `Platform`, `Transport`) change only through a PR that updates the owning document and
notifies the other lanes (PR description, label `contract-change`).

## Critical path and risks

| Risk | Impact | Mitigation | Where tracked |
|---|---|---|---|
| Report math differs between Python and TS (floats, rounding, DST) | wrong numbers shown to users | fixtures with tolerances, property tests, per-module PRs | MP-22, MP-11 |
| Android SQLite plugin speed/maintenance | slow or unmaintained persistence | spike picks; fallback is an in-repo plugin | MP-26, MP-12 |
| Old Android SQLite version lacks required features | `RETURNING`/window functions fail | feature check at open; raise minSdk or bundle SQLite | MP-12, Q10 |
| Web users without a server | web needs a server; casual users may not want to run one | one-command local server (Docker/Node), clear guide, Android app offers true on-device local mode | MP-14, MP-17 |
| F-Droid rejects the build (non-free dependency or non-reproducible step) | blocks one channel | FOSS-only plugin policy, recipe CI mimic | MP-20, MP-23 |
| Play policy changes (target API, 16 KB, data safety) | blocks Play updates | check requirements each release; keep dependencies current | MP-23 |
| ID change (numbers -> strings) ripples through the UI | regressions | land with the API v1 switch, typed `Id` alias, full web test run | MP-15 |
| Scope creep (sync, multi-user, multi-currency) | never ships | non-goals enforced in review; ADR required | MP-00 |
| Single-maintainer bus factor | project stalls | docs-first plan, small PRs, governance file, agent-friendly work packages | MP-24, MP-27 |
| License/relicensing issues | cannot publish | Q7 early, copyright audit | MP-24 |

## Definition of done per milestone

A milestone is done when: its exit criteria pass in CI; docs listed under its packages are updated (status lines ticked, `AGENTS.md`/`README.md`/`docs/API.md`/`docs/LIVE_SCHEMA.sql`
where they changed); no TODO without an issue; the owner reviewed the demo (for M6+ a short screen recording or screenshots in the PR).

## Rollout plan for the cut-over (M9)

1. Keep the Python backend **frozen** (bug fixes only) from M2 onward.
2. M5: web integration tests and `scripts/dev.sh` run on the Node server; the Python path remains selectable (`BACKEND=python`).
3. M6-M8: new features land only on the TS stack.
4. M9: delete `backend/` in a dedicated PR after the owner confirms there are no remaining users of v0.5; keep the parity fixtures (they are recorded data, no Python needed to replay) and the recorder script under `tests/parity/legacy/` marked as historical.
5. Update `AGENTS.md`, `CONTRIBUTING.md`, CI, release-please config and `docs/ARCHITECTURE.md` (rewrite for the TS architecture; the old text is archived under `docs/archive/`).

Because there is no deployed production dataset today (pre-release, DB recreated on schema change), the cut-over needs **no data migration** from the old Python database. If the owner has a database they want to keep, add a one-off
`tools/import-from-v05` script that reads the old SQLite file and produces an Archive (MP-19); do not build it speculatively.
