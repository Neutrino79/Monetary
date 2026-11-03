# 28 -- Parallel delivery: branches, agents, waves and merging

> **ID** MP-28 · **Status** Draft · **Depends on** MP-25, MP-27 · **Unblocks** running several agents at once without collisions

**Agent brief.** This is the operating manual for doing the whole feature with many agents at the same time. Read it before you start any work package.
Branch from the **integration branch** `feat/multi-platform`, open your PR **against it** (never `main`), stay inside your lane's paths, and wait for the
interfaces your work depends on to be merged. The orchestrator and owner use this document to assign, sequence, merge and test.

## 1. Branch model

```text
main                      stable, release-please reads it; receives ONE final merge at the end
 └─ feat/multi-platform   integration branch: PR-only, always green, tested as a whole
     ├─ feat/core-money-port          one branch + one PR per task slice (agent branches)
     ├─ feat/api-auth-routes
     ├─ chore/repo-move-apps-web
     └─ docs/mp-12-clarifications
```

1. **Base**: every agent branches from the latest `origin/feat/multi-platform`, and the PR's base is `feat/multi-platform`. Branch names follow `<type>/<kebab>` (`AGENTS.md`).
   Spike and throwaway experiments (MP-26) branch from `main`, are never merged, and only their written results land.
2. **Merge into integration by squash**, one conventional commit per task slice (the PR title is the commit header). This matches `CONTRIBUTING.md` ("squash-merge only") for every agent PR.
3. **Nobody commits or pushes directly to `feat/multi-platform` or `main`.** Owner action: add branch protection/rulesets for both: PR required, CI checks required, owner review required, no force-push.
4. **Keep integration current with `main`**: if `main` changes (it should rarely, the Python backend is frozen), merge `main` into `feat/multi-platform` via a PR named `chore/sync-main-into-multi-platform`
   using a *merge commit*, never rebasing the shared branch. Agents then rebase their own branches.
5. **The plan itself** (`docs/multi-platform-architecture`) is the first PR, targeting `feat/multi-platform`. Its three commits stay as they are; the PR is squash-merged.
6. **Final merge** (`feat/multi-platform` -> `main`) happens once, after the final gate in section 6. Decision **D1 (owner)**: `CONTRIBUTING.md` says squash-merge only, but squashing a feature this large into one commit
   hides every `feat`/`fix` from release-please and makes history unreviewable. **Recommended: allow a merge commit for this one PR** so release-please reads each conventional commit
   (`main`'s history already contains `Merge pull request #N` commits, so merge commits appear to be enabled **(verify the repository setting)**). The API v1 and id change are breaking: carry a `BREAKING CHANGE:` footer.
7. **CI facts** (read from the repo): `ci.yml` and `pr-checks.yml` run on `pull_request` for **any** base branch, so PRs into the integration branch are fully checked. But `ci.yml` pushes only on `main`, and the
   weekly `schedule` runs only on the default branch, and `release-please.yml` triggers only on `main`. Therefore (tasks in MP-10): trigger CI on pushes to `feat/multi-platform` too, and make nightly jobs
   (Android emulator, perf, parity) explicitly check out `feat/multi-platform`.

## 2. Roles

| Role | Does | Does not |
|---|---|---|
| **Owner** (human) | confirms decisions, sets branch protection, reviews and approves, decides D1-D3, final merge | write feature code in parallel with agents on the same paths |
| **Orchestrator** (one agent/session, or the owner) | turns each work-package checklist into issues, assigns slices to lanes, tracks the board, resolves cross-lane questions, keeps this plan truthful | merge, or implement slices (it stays free to coordinate) |
| **Implementer agents** | take one task slice each, in their own worktree, and deliver one small PR | touch paths outside their lane, or change a shared interface without a `contract-change` PR |
| **Reviewer agent** (fresh context, no access to the implementer's reasoning) | reads the diff and the work-package's acceptance criteria, runs the verification commands, reports real results | approve its own work |
| **Integrator** (owner or one agent) | merges approved green PRs one at a time in dependency order, runs the wave gate, triggers rebases | skip the gate |

## 3. Mechanics for running agents at once

- **One agent = one task slice = one branch = one PR at a time = one worktree.** From the repo: `git worktree add ../wt-<slice> -b <type>/<name> origin/feat/multi-platform`
  (or a separate clone, or the agent tool's worktree isolation). Agents never share a working tree.
- **Claim a slice** with a GitHub issue per slice (`MP-12.2: SqlDriver port + migration runner`), labels `multi-platform`, `lane:A`..`lane:E`, `wave:N`, assignee = the session. The orchestrator generates the issues from each
  document's **Tasks** checklist. The PR says `Refs: MP-12.2`. One open issue per slice prevents two agents building the same thing.
- **Stay in your lane's paths** (section 5). A change to someone else's path, or to a shared interface, goes through a small PR labelled `contract-change` that the owning lane reviews first.
- **Interfaces first** (section 4): consumers code against merged interface PRs, or against a local stub that is deleted when the real thing merges.
- **Small PRs**: aim for under about 400 changed lines of hand-written code, one logical change, tests included. Large generated files (lockfile, OpenAPI) don't count.
- **Sync often**: before opening a PR and whenever the integrator asks, `git fetch && git rebase origin/feat/multi-platform` on your own agent branch (force-push your own branch with `--force-with-lease` only, `AGENTS.md` rule 1).
- **Serialized merges**: the integrator merges one PR at a time; after each merge the next PR rebases and CI re-runs. A GitHub merge queue can automate this **(verify availability for this repo)**.
- **Capacity**: 5-6 implementer agents at once is the practical ceiling. Review and merging are the bottleneck, not typing. Keep at most 2 open PRs per lane.
- **Blocked?** Add the `blocked` label, name the missing dependency in the issue, and pick another slice. Never work around a missing interface by editing another lane's files.
- **Everyone uses the repository's configured git identity.** No agent changes git config, adds attribution lines, bypasses hooks or touches generated files (playbook MP-27).

## 4. Work division: waves

Waves are ordered by dependency. A wave starts when its predecessors' **merge gate** is met, but individual slices start as soon as *their* listed prerequisites are merged.

### Wave 0 -- now, parallel, no conflicts (paths are new or read-only)

| Slice | Work | Paths | Notes |
|---|---|---|---|
| W0-1 | MP-22a: fixture recorder + 30 scenarios against the Python backend | `tests/parity/**` (reads `backend/`) | unblocks all of core |
| W0-2 | MP-24a: community files (CODE_OF_CONDUCT, GOVERNANCE, SUPPORT, SECURITY, issue templates, brand draft) | new root and `.github/ISSUE_TEMPLATE` files only | do **not** touch README, CONTRIBUTING, LICENSE yet |
| W0-3 | MP-26 spike, Node group (S4, S5, S9, S10) | throwaway branch | results to `spike-report.md` |
| W0-4 | MP-26 spike, Android group (S1, S2, S7, S8) | throwaway branch | needs an Android SDK, emulators and a physical mid-range phone: likely the owner's machine |
| W0-5 | MP-26 S6: in-process API bundle size | throwaway branch | |
| Owner | merge the plan PR; choose the Android application id; set branch protection; answer D1-D3 | -- | |

### Wave 1 -- foundations (ONE agent, serial, short)

| Slice | Work | Paths |
|---|---|---|
| W1-1 | MP-10: pure `git mv web apps/web`, workspaces, empty packages, boundary rules, CI jobs in separate workflow files, AGENTS/CONTRIBUTING/README updates | repo root, `apps/*`, `packages/*` scaffolding, `.github/**`, `scripts/**` |

During the move PR, **no one else edits `web/`** (it is a window of hours). After it merges, every web-touching agent rebases. The interface PRs F1-F4 below follow immediately.

### Interface freeze points (small PRs, merged before their consumers)

| ID | Interface | First PR by | Consumers |
|---|---|---|---|
| **F1** | `SqlDriver`, `SqlValue`, storage error types, `Clock`, `IdGenerator`, `Hasher` ports | A2 (MP-12) | all services, drivers, local-runtime |
| **F2** | `contract` skeleton: ids, money, error body, `ArchiveV1` stub, `/meta` shape | B1 (MP-13) | api, client, ui |
| **F3** | `Transport` and `Platform` interfaces | C2 / C1 (MP-15 / MP-16) | onboarding, local-runtime, mobile |
| **F4** | Domain types (entities, enums, `Money`, errors) | A1 (MP-11) | services, repositories, api mappers |

### Wave 2 -- parallel lanes (up to 7 agents)

| Slice | Lane | Work | Paths (owned) | Needs merged first |
|---|---|---|---|---|
| A1 | A Core | MP-11 rows 1-8: errors, enums, money, time, ledger, tags, security, pace/analytics | `packages/core/src/domain/**`, `core/src/testing/**` | MP-10 |
| A2 | A Core | MP-12: ports, migration runner, `0001_init.sql`, conformance suite, `sqlite-node` | `packages/core/src/storage/{ports,migrations,conformance}/**`, `packages/sqlite-node/**` | MP-10 |
| B1 | B API | MP-13: schemas per resource, OpenAPI generation, drift check | `packages/contract/**`, `docs/openapi/**` | MP-10 |
| C1 | C UI | MP-16: Platform port, fonts, back button, safe areas, shortcut hints, CSP | `apps/web/src/platform/**`, `apps/web/src/styles/**`, `apps/web/src/components/{ui/Dialog,layout}/**` | MP-10 |
| E1 | E Server | MP-14: config, startup, lock, backup CLI, Docker/compose, static hosting, self-hosting doc (stub `createApi`) | `apps/server/**`, `docs/self-hosting.md` | MP-10, F1 |
| D1 | D Mobile | MP-20: Capacitor scaffold, mobile web build, manifest/permission CI, `sqlite-capacitor` per spike | `apps/mobile/**`, `packages/sqlite-capacitor/**` | MP-10, F1, spike S1/S2/S8 |
| E2 | E Release | MP-23: release workflow skeleton, signing doc, fastlane metadata, privacy policy draft | `.github/workflows/release-*.yml`, `docs/{signing,privacy-policy,store-listing}.md`, `apps/mobile/fastlane/**` | MP-10 |

### Wave 3 -- services, routes, client (after F1, F2, F4 and the domain modules)

| Slice | Lane | Work | Paths (owned) | Needs |
|---|---|---|---|---|
| A3 | A | MP-11 rows 10-11: users, accounts, categories, seed, transactions, tags | `core/src/application/{user,account,transaction,tag,seed}*`, matching `storage/*Repo.ts` | A1, A2 |
| A4 | A | MP-11 row 12: transfers, splits, settlements, friend balances | `core/src/application/{transfer,split,settlement}*` | A1, A2, A3 (accounts) |
| A5 | A | MP-11 row 13: budgets, statements, reconcile, dashboard, trends, reports | `core/src/application/{budget,statement,reconcile,dashboard,trends,reports}*` | A1 (analytics), A3 |
| B2a-d | B | MP-13 routers in four groups: (a) setup/auth/owner, (b) accounts/categories/tags, (c) transactions/transfers/splits/settlements/friends, (d) reports | `packages/api/src/routes/<group>/**` | F2, the matching service interface (stub until A3-A5 merge) |
| C3 | C | MP-15: `client` package, services move, string-id migration | `packages/client/**`, `apps/web/src/{lib/api,hooks,types}/**` | F2, F3 |
| G1 | A/B | MP-19: archive export/import | `core/src/application/archive*`, `api/src/routes/archive*` | storage, A3-A4 |

### Wave 4 -- integration

| Slice | Work |
|---|---|
| H1 | MP-17 onboarding and mode flows (needs C1, C3, E1) |
| H2 | MP-18 items: app lock, redacting logger, audits, `npm audit` + license CI |
| H3 | MP-20 completion: `local-runtime`, `capacitorPlatform`, Android smoke tests, budgets measured |
| H4 | MP-22 completion: all parity scenarios green, Playwright e2e, perf benchmarks |
| H5 | MP-14 integration tests against the real API; `scripts/dev.sh` switched to the Node server |

### Wave 5 -- cut-over and release

M9 (delete `backend/`, rewrite `docs/ARCHITECTURE.md`/`docs/API.md`, update `AGENTS.md`), MP-24 license application (owner-approved PR), the release checklist (MP-23), then the final merge (section 1.6).

### Dependency rules in one list

`MP-10` before everything in waves 2+ · `F1` before any service, driver or `local-runtime` · `F2` before `api` routes and `client` · `F4` before services · domain (A1) before services · services before the routes they expose
(routes may start earlier against stubs) · reports (A5) last in core · `client` (C3) before onboarding · `capacitorPlatform` and `local-runtime` before the Android smoke tests · spike results before D1's plugin choice.

## 5. Path ownership and conflict hot spots

| Path | Owner lane | Rule |
|---|---|---|
| `packages/core/**` | A | split by folder/file per slice (table above) |
| `packages/contract/**`, `packages/api/**`, `docs/openapi/**` | B | `docs/openapi/v1.json` is generated: on conflict, regenerate with `npm run gen:openapi` |
| `packages/client/**`, `apps/web/**` | C | web slices are split by sub-folder (Wave 2/3 tables) |
| `apps/mobile/**`, `packages/sqlite-capacitor/**`, `packages/local-runtime/**` | D | |
| `apps/server/**`, `.github/workflows/release-*`, `docs/{self-hosting,signing,privacy-policy,store-listing}.md` | E | |
| root `package.json`, `tsconfig*.json`, `.dependency-cruiser.cjs`, `vitest.workspace.ts` | **MP-10 only** | MP-10 pre-registers all packages and project references so nobody edits these again; later changes need a `contract-change` PR |
| `package-lock.json` | nobody by hand | add dependencies in your own package manifest with `npm`; on conflict take integration's lockfile and re-run `npm install` |
| `packages/*/src/index.ts` barrels | the package's lane | one export per line, alphabetical; prefer folder-level `index.ts` re-exports so slices do not edit the same lines |
| CI workflows | per concern | one workflow file per concern (`ts.yml`, `parity.yml`, `e2e.yml`, `android.yml`, `release-*.yml`) so lanes never edit the same YAML |
| `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `LICENSE` | **MP-10** (structure), **MP-24** (public README/license) | other slices put package docs in their own `README.md` and note needed root-doc changes in the PR description for the orchestrator |
| `docs/API.md`, `docs/LIVE_SCHEMA.sql` | B / A2, **at cut-over** | replaced when v1 goes live, not piecemeal |
| `docs/multi-platform/parity-exceptions.md` | any slice that finds a difference | append-only table: rebase conflicts resolve by keeping both rows |
| `packages/core/src/storage/migrations/**` | A2 | only A2 creates `0001`; later migrations claim their number in the issue first |

## 6. How the integration branch is tested

**Per PR (required checks before merge into `feat/multi-platform`):** hygiene (pre-commit), `ts` (typecheck, lint, boundaries, tests with coverage), `parity` (once it exists), web unit tests, `backend` (until M9),
the slice's own verification commands from its work-package document, a reviewer-agent report, and the owner's review.

**Per wave (run by the integrator on `feat/multi-platform` after the wave's PRs merge):**

| Wave | Gate |
|---|---|
| 1 | root install/typecheck/lint/test/build + boundaries pass; web tests (207) pass after the move; `git log --follow` shows history |
| 2 | every package builds and its own tests pass; conformance green on `sqlite-node`; OpenAPI drift check green; web Platform tests green; server boots in Docker; Capacitor project builds a debug APK |
| 3 | all parity scenarios green (or signed exceptions); API tests >= 95%; web runs against the Node server end to end (`npm run test:integration`) with string ids |
| 4 | onboarding flows pass Playwright; Android emulator smoke passes in airplane mode; export/import round-trip passes; performance numbers recorded |
| 5 | **final gate** below |

**Nightly on the integration branch** (jobs check out `feat/multi-platform` explicitly): full test suites, perf benchmarks, Android emulator smoke, Docker image build, dependency audit.

**Owner dogfood** after wave 4: install the debug APK, run `docker compose up`, and tick the manual checklist (setup, add each transaction type, reports, export/import, switch modes, kill the app mid-save, update with a dummy migration).

**Final gate before `feat/multi-platform` -> `main`:** MP-25 milestone M9 exit criteria, every success criterion in MP-00, the MP-23 release checklist, a clean secrets/history audit (MP-24), a fresh-clone build from the README alone,
and the owner's explicit approval. Only then open the single PR into `main` (D1 for merge style).

## 7. Reviewing and keeping quality with many writers

- A **reviewer agent per PR** starts from the diff, the work-package acceptance criteria and the repo rules; it never reads the implementer's summary first. It must run the verification commands and report real output.
- For high-risk slices (money math, migrations, auth, archive import, signing) require **two** independent reviews, one of them the owner.
- **Parity is the arbiter** for behavior questions: if the replayer and a human disagree, the recorded Python behavior wins until the owner signs an exception.
- Drift watch: the orchestrator re-reads this plan weekly and fixes documents that no longer match reality (small `docs/` PRs).

## 8. Assignment prompt for an implementer agent

> Work in the Monetary repository. Read `AGENTS.md`, `docs/multi-platform/27-agent-playbook.md` and `28-parallel-delivery.md`, then `README.md`, `00`, `01` and `docs/multi-platform/<NN-document>.md`.
> Your slice is **<slice id>: <title>** (issue #<n>). Create a worktree from `origin/feat/multi-platform` on a branch `<type>/<kebab>`. Touch only these paths: <paths>. Wait for / use these merged interfaces: <F-ids>.
> Deliver one small PR **against `feat/multi-platform`** (not `main`) with tests, updated docs for your package, and the exact verification commands with their real results in the description. No attribution lines,
> no git config changes, no hook bypass. If a prerequisite is missing or a rule seems to conflict with the task, stop and tell me.

## 9. Owner actions

- [ ] Merge (or approve) the plan PR into `feat/multi-platform` as its first change.
- [ ] Add branch protection/rulesets for `main` and `feat/multi-platform` (PR, required checks, owner review, no force-push).
- [ ] Decide **D1** final merge style, **D2** whether to use a merge queue, **D3** whether the orchestrator creates the GitHub issues and labels.
- [ ] Choose the Android application id (Q8).
- [ ] Provide an Android test setup (emulator images and one mid-range physical phone) for spike group B and the smoke tests.
- [ ] Decide how many agents run at once (recommended 4 at the start, up to 6 in waves 2-3).

## Tasks

- [ ] Orchestrator: create labels and one issue per slice from the work-package checklists; set up a GitHub Project board (waves as columns).
- [ ] Add the CI trigger and nightly-checkout changes listed in section 1.7 (as part of MP-10's CI task).
- [ ] Add a PR template section "Lane / slice / interfaces consumed" and a `contract-change` label.
- [ ] Review this document with the owner after the first wave and adjust lanes to real throughput.

## Acceptance criteria

- Two agents can work for a day on different lanes and merge into `feat/multi-platform` without a manual conflict resolution beyond lockfile/generated files.
- Every merged PR targeted `feat/multi-platform`, passed the required checks and has a reviewer report.
- The wave gates in section 6 are runnable by one command or a short checklist.

## Files you may touch

This document, `.github/pull_request_template.md`, issue labels/templates, `docs/multi-platform/README.md` index row.

## Out of scope

Choosing agent products or tooling, hosting a CI runner farm, a custom merge bot.
