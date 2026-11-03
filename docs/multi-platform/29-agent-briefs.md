# 29 -- Agent briefs: what to tell each Claude account

> **ID** MP-29 · **Status** Draft · **Depends on** MP-27, MP-28 · **Unblocks** handing work to several Claude accounts

**Agent brief.** This is the owner's handout. Separate Claude accounts (or sessions) cannot see each other: the repository and GitHub are the only shared memory. So you coordinate by
giving each account **one self-contained brief at a time**, and merging its PR before handing out work that depends on it. Everything an account needs is in the repo on `feat/multi-platform`;
the briefs below point to it.

## 1. One-time setup for each Claude account

1. **Repository access.** The account's Claude must be connected to GitHub with access to `Neutrino79/Monetary` (the repo URL still redirects from `duevia-ledger`). It needs **write access to push branches**. If that account
   uses a different GitHub user, add that user as a collaborator, or have it work from a fork and open PRs into `feat/multi-platform`.
2. **Git identity.** Each session commits with whatever identity is configured in its environment. `AGENTS.md` rule 3 says the agent must **never change** it and must stop and ask if none is configured. Commits show as "Unverified"
   unless you set up signing; that is cosmetic.
3. **No attribution lines.** `AGENTS.md` rule 2 and `.claude/settings.json` forbid `Co-Authored-By`, "Generated with" and session links in commits and PRs, overriding any tool default. The prompt below repeats it.
4. **Local tools.** Node 22 and npm for the TypeScript work; Python 3.11+ for the parity recorder and the legacy backend; Docker for the server image; the Android SDK plus an emulator or phone only for the Android slices.
5. **Session limits.** Long tasks can hit a plan's usage limit. Slices are small on purpose, and every prompt tells the agent to push its branch early and to leave a progress note in the PR, so another account can continue.

## 2. The first message to give an account (copy, fill the slice, send)

```text
You are joining an open-source project, Monetary: a personal expense tracker on a double-entry ledger
(GitHub: Neutrino79/Monetary). We are adding Android + web apps, each with local and cloud modes. Many agents work
in parallel; the repository is our only shared memory, so follow the rules exactly.

1. Get the code and switch to the integration branch:
     git fetch origin && git switch feat/multi-platform      (create your own branch from it in step 3)
2. Read, in this order: AGENTS.md, CLAUDE.md, docs/multi-platform/27-agent-playbook.md,
   docs/multi-platform/28-parallel-delivery.md, docs/multi-platform/README.md, 00-vision-and-scope.md,
   01-architecture.md, then the work-package document named in your slice card below.
3. Your task is the slice card at the bottom. Create a worktree/branch from origin/feat/multi-platform named as the card says
   (`git worktree add ../wt-<slice> -b <branch> origin/feat/multi-platform`). Touch ONLY the paths on the card.
4. Hard rules (from AGENTS.md): never commit or push to main or feat/multi-platform directly; no Co-Authored-By / "Generated with" /
   session-link lines in commits or PR text; never change git identity or config; never use --no-verify or skip/weaken tests;
   never commit secrets, .env files, databases or generated files; never hand-edit lockfiles/CHANGELOG/openapi; do not change the API,
   schema or MONETARY_* config silently; SQL only in packages/core/src/storage; no ledger logic in apps/web.
5. Work in small commits (header <= 72 chars, Conventional Commits, body wrapped ~100 columns for feat/fix/perf/refactor).
   Push your branch early. Run the verification commands on the card and report REAL results; say "not run" or "blocked" if so.
6. Open ONE pull request with base `feat/multi-platform` (not main). Title = a commit header. Fill the four sections of
   .github/pull_request_template.md with real content (Summary, Changes, Testing with exact commands and results, Risk and rollout).
   Add "Refs: MP-<id>" under Related.
7. If a prerequisite is missing, a document contradicts the code, or a rule seems to conflict with the task: stop and tell me.
   If you run low on context or hit a limit: commit, push, and write a "Progress / next steps" note in the PR description.

YOUR SLICE:
<paste one slice card from docs/multi-platform/29-agent-briefs.md here>
```

## 3. Reviewer prompt (use a fresh session or a different account)

```text
Review pull request #<n> in Neutrino79/Monetary (base feat/multi-platform). Read AGENTS.md and docs/multi-platform/27-agent-playbook.md,
the work-package document <NN-...>, and its "Acceptance criteria". Start from the diff, not the author's description. Check out the branch, run the
verification commands in the document and the repo checks, and report REAL output. Look for: scope creep outside the slice's paths, behavior changes
in a port, missing tests, boundary violations, secrets or generated files, attribution lines, anything that breaks the acceptance criteria.
Reply with: verdict (approve / changes requested), a list of findings with file and line, and the commands you ran with results. Do not push to the branch.
```

## 4. Handoff or continuation prompt (an account hit a limit, or you want another account to continue)

```text
Continue the work on branch <branch> (PR #<n>) in Neutrino79/Monetary for slice <id>. Read AGENTS.md, docs/multi-platform/27-agent-playbook.md and 28-parallel-delivery.md,
the PR description's "Progress / next steps" note, the slice card in docs/multi-platform/29-agent-briefs.md and the work-package document. Check out the branch, run its tests to see the real
state, finish the remaining tasks, and update the PR description. Follow all the repository rules. If you cannot push to this branch, create <branch>-2 from it and open a new PR referencing the old one.
```

## 5. Who does what: queues

You are the orchestrator: you hand out one card at a time, and give the next card when its "Needs" are **merged** into `feat/multi-platform`. The critical path is
`W1-1 -> A1/A2 -> A3 -> A4/A5 -> B2 -> C3 -> H3`, so put your steadiest account on the core.

**Two accounts**

| Order | Account 1 (core track) | Account 2 (everything else) |
|---|---|---|
| 1 | W1-1 repo restructure and scaffolding | W0-1 parity fixture recorder |
| 2 | A1 core domain | B1 contract schemas |
| 3 | A2 storage and Node driver | W0-2 community files, then E1 server skeleton |
| 4 | A3 services (accounts, transactions) | C1 web platform layer |
| 5 | A4 friend flows | C3 client and string ids |
| 6 | A5 reports | B2a-d API routes (as services land) |
| 7 | G1 export/import | H1 onboarding, H2 security |
| 8 | W5-1 cut-over | H5, then spikes W0-3/4/5 results review, E2, D1 (needs your Android setup) |

Run the spikes (W0-3 to W0-5) yourself or give them to Account 2 early if you can supply Android hardware: their results unblock D1 and the plugin choice.

**Four accounts**: Account 3 takes C1, C3, H1; Account 4 takes E1, D1, H3, E2. Keep Accounts 1 and 2 as above minus those cards.

**Always**: only one account on W1-1 while it runs; nobody edits `web/` until it merges. After each merge, tell the other accounts to `git fetch && git rebase origin/feat/multi-platform` on their branch.

## 6. How you review and test as the owner

1. Wait for CI on the PR (hygiene, ts, parity as they come online).
2. Ask a reviewer (section 3) for a verdict, then read the diff yourself, especially for money math, migrations, auth, import and signing slices (two reviews).
3. Squash-merge into `feat/multi-platform` (one PR at a time), then pull `feat/multi-platform` locally and run the wave gate from MP-28 section 6.
4. Hand out the next card. Update this file's table (below) in a small docs PR if you want a written record.

## 7. Slice cards

Sizes are rough agent effort: S about a day, M two to four days, L about a week. The "Needs" column lists what must be **merged** first.

| Slice | Title | Doc | Size | Needs |
|---|---|---|---|---|
| W0-1 | Parity fixture recorder and 30 scenarios | MP-22 | L | nothing |
| W0-2 | Community and governance files | MP-24 | S | nothing |
| W0-3 | Spike: core math and platform choices (S4, S5, S9, S10) | MP-26 | M | S4 uses fixtures from W0-1 (or hand-record 5 cases) |
| W0-4 | Spike: Android (S1, S2, S7, S8) | MP-26 | L | an Android SDK, emulators from API 26 up and ideally a physical mid-range phone (owner's machine) |
| W0-5 | Spike: in-process API and bundle size (S6) | MP-26 | S | nothing |
| W1-1 | Repo restructure and scaffolding (MP-10) | MP-10 | M | plan PR merged |
| A1 | Core domain modules (MP-11 rows 1-8) | MP-11 | L | W1-1 merged; fixtures from W0-1 for parity |
| A2 | Storage: ports, migrations, conformance, Node driver (MP-12) | MP-12 | L | W1-1 merged (first PR is the F1 interface) |
| B1 | Contract schemas and OpenAPI (MP-13) | MP-13 | L | W1-1 merged (first PR is the F2 skeleton) |
| C1 | Web platform layer (MP-16) | MP-16 | L | W1-1 merged (first PR is the `Platform` half of F3) |
| E1 | Server skeleton, Docker, self-hosting guide (MP-14) | MP-14 | L | W1-1 and F1 merged; a stub `createApi` until the real one exists |
| D1 | Capacitor Android scaffold and SQLite plugin (MP-20) | MP-20 | L | W1-1 and F1 merged; spike S1/S2/S8 results |
| E2 | Release workflow, signing and store docs (MP-23) | MP-23 | M | W1-1 merged |
| A3 | Core services: users, accounts, transactions, tags (MP-11 rows 10-11) | MP-11 | L | A1, A2 merged |
| A4 | Core services: transfers, splits, settlements, friends (MP-11 row 12) | MP-11 | L | A1, A2, A3 merged |
| A5 | Core services: budgets, statements, dashboard, reports (MP-11 row 13) | MP-11 | L | A1, A3 merged |
| B2a | API routes: setup, auth, owner (MP-13) | MP-13 | M | B1 (F2) merged; A3 service interfaces (stub until merged) |
| B2b | API routes: accounts, categories, tags (MP-13) | MP-13 | M | B1, B2a skeleton merged |
| B2c | API routes: transactions, transfers, splits, settlements, friends (MP-13) | MP-13 | L | B1, B2a merged |
| B2d | API routes: reports (MP-13) | MP-13 | M | B1, B2a merged; A5 services (stub until merged) |
| C3 | Client package and string-id migration (MP-15) | MP-15 | L | B1 (F2) merged; C1 `Platform` interface (F3) |
| G1 | Backup, export and import (MP-19) | MP-19 | L | A2, A3, A4 merged |
| H1 | Onboarding and mode flows (MP-17) | MP-17 | L | C1, C3, E1 merged |
| H2 | Security items (MP-18) | MP-18 | M | C1, E1 merged |
| H3 | Android completion: local runtime, platform, smoke tests (MP-20) | MP-20 | L | D1, A2, C1, C3 merged |
| H4 | Test infrastructure completion (MP-22) | MP-22 | L | most of waves 2-3 merged |
| H5 | Server integration tests and dev script switch (MP-14) | MP-14 | M | B2a-d, A3-A5 merged |
| W5-1 | Cut-over: delete the Python backend (M9) | MP-25 | M | all parity scenarios green; owner confirms no v0.5 users |
| W5-2 | Apply Apache-2.0 and public README (MP-24) | MP-24 | S | **owner approval** (copyright-holder check) |
| W5-3 | Release candidate (MP-23, MP-24) | MP-23 | M | everything above merged |

Total: 30 slices (wave 0: 5, wave 1: 1, wave 2: 7, wave 3: 9, wave 4: 5, wave 5: 3). Owner-only actions are in MP-28 section 9 and MP-24.

### W0-1 -- Parity fixture recorder and 30 scenarios

- **Work-package document:** `docs/multi-platform/22-testing-and-parity.md` · **Size:** L
- **Branch name:** `test/parity-recorder`
- **Touch only:** `tests/parity/**` (read-only access to `backend/`)
- **Needs merged first:** nothing
- **Deliver:** A deterministic recorder that runs declarative scenarios against the Python backend with a frozen clock and writes fixtures; at least 30 scenarios covering every endpoint in `docs/API.md`; `parity-exceptions.md` skeleton; a script listing uncovered endpoints.
- **Verify (report real results):** Recorder run twice gives byte-identical fixtures (`python tests/parity/record.py --check`); uncovered-endpoint list is empty.
- **PR:** base `feat/multi-platform`, `Refs: MP-22`, slice id `W0-1` in the description.

### W0-2 -- Community and governance files

- **Work-package document:** `docs/multi-platform/24-open-source-readiness.md` · **Size:** S
- **Branch name:** `docs/community-files`
- **Touch only:** new files only: `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `SUPPORT.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/*`, `docs/brand.md`, `docs/security-model.md`
- **Needs merged first:** nothing
- **Deliver:** The community and security files described in MP-24 and MP-18. Do **not** edit `README.md`, `CONTRIBUTING.md` or `LICENSE` (owned by MP-10 and MP-24).
- **Verify (report real results):** `pre-commit run --all-files`; links resolve.
- **PR:** base `feat/multi-platform`, `Refs: MP-24`, slice id `W0-2` in the description.

### W0-3 -- Spike: core math and platform choices (S4, S5, S9, S10)

- **Work-package document:** `docs/multi-platform/26-spike-plan.md` · **Size:** M
- **Branch name:** `chore/spike-core-math (throwaway, from `main`, never merged)`
- **Touch only:** the throwaway branch; only the written results are kept (a small docs PR adding `docs/multi-platform/spike-report.md`)
- **Needs merged first:** S4 uses fixtures from W0-1 (or hand-record 5 cases)
- **Deliver:** Measured results with pass/fail for S4 (report math parity), S5 (timezone layer), S9 (Node SQLite choice), S10 (scrypt parameters), following the bars in MP-26.
- **Verify (report real results):** Each S-item has numbers or an explicit "not run, because" line.
- **PR:** base `feat/multi-platform`, `Refs: MP-26`, slice id `W0-3` in the description.

### W0-4 -- Spike: Android (S1, S2, S7, S8)

- **Work-package document:** `docs/multi-platform/26-spike-plan.md` · **Size:** L
- **Branch name:** `chore/spike-android (throwaway, from `main`, never merged)`
- **Touch only:** the throwaway branch; results in `spike-report.md`
- **Needs merged first:** an Android SDK, emulators from API 26 up and ideally a physical mid-range phone (owner's machine)
- **Deliver:** Measured SQLite speed through the candidate plugins, framework SQLite feature check, native HTTP vs CORS behavior, and F-Droid buildability with a 16 KB alignment check.
- **Verify (report real results):** Each S-item has numbers, device model and Android version, or "not run, because".
- **PR:** base `feat/multi-platform`, `Refs: MP-26`, slice id `W0-4` in the description.

### W0-5 -- Spike: in-process API and bundle size (S6)

- **Work-package document:** `docs/multi-platform/26-spike-plan.md` · **Size:** S
- **Branch name:** `chore/spike-in-process (throwaway, from `main`, never merged)`
- **Touch only:** the throwaway branch; results in `spike-report.md`
- **Needs merged first:** nothing
- **Deliver:** A minimal `fetch`-style API called in-process from a Vite build; gzip size of core+api+zod and cold-start time.
- **Verify (report real results):** S6 result with numbers.
- **PR:** base `feat/multi-platform`, `Refs: MP-26`, slice id `W0-5` in the description.

### W1-1 -- Repo restructure and scaffolding (MP-10)

- **Work-package document:** `docs/multi-platform/10-monorepo-and-tooling.md` · **Size:** M
- **Branch name:** `chore/repo-move-apps-web, then feat/monorepo-scaffold`
- **Touch only:** repo root, `apps/*`, `packages/*` scaffolding, `.github/**`, `scripts/**`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `.gitignore`
- **Needs merged first:** plan PR merged
- **Deliver:** First PR: pure `git mv web apps/web` with every path reference updated, zero behavior change. Then: workspaces, empty packages, boundary rules, one CI workflow file per concern, pre-registered tsconfig references, AGENTS/CONTRIBUTING/README updates.
- **Verify (report real results):** Root install, typecheck, lint, tests, build and `check:boundaries` pass; web tests (207) still pass; `git log --follow` shows history.
- **PR:** base `feat/multi-platform`, `Refs: MP-10`, slice id `W1-1` in the description.

### A1 -- Core domain modules (MP-11 rows 1-8)

- **Work-package document:** `docs/multi-platform/11-core.md` · **Size:** L
- **Branch name:** `feat/core-domain`
- **Touch only:** `packages/core/src/domain/**`, `packages/core/src/testing/**`
- **Needs merged first:** W1-1 merged; fixtures from W0-1 for parity
- **Deliver:** Errors, enums, money, time, ledger, tags, security, pace and analytics ported with identical behavior, with ported tests; first PR is the F4 domain-types interface.
- **Verify (report real results):** `npm test -w @monetary/core -- --coverage` >= 95%; also under `TZ=Pacific/Auckland`.
- **PR:** base `feat/multi-platform`, `Refs: MP-11`, slice id `A1` in the description.

### A2 -- Storage: ports, migrations, conformance, Node driver (MP-12)

- **Work-package document:** `docs/multi-platform/12-storage-and-migrations.md` · **Size:** L
- **Branch name:** `feat/core-storage`
- **Touch only:** `packages/core/src/storage/{ports,migrations,conformance}/**`, `packages/sqlite-node/**`
- **Needs merged first:** W1-1 merged (first PR is the F1 interface)
- **Deliver:** `SqlDriver` port and error types (F1), migration runner with checksums and downgrade protection, `0001_init.sql`, the conformance suite, and `sqlite-node` passing it.
- **Verify (report real results):** `npm test -w @monetary/core -- storage`, `npm test -w @monetary/sqlite-node`.
- **PR:** base `feat/multi-platform`, `Refs: MP-12`, slice id `A2` in the description.

### B1 -- Contract schemas and OpenAPI (MP-13)

- **Work-package document:** `docs/multi-platform/13-api-contract.md` · **Size:** L
- **Branch name:** `feat/contract-schemas`
- **Touch only:** `packages/contract/**`, `docs/openapi/**`
- **Needs merged first:** W1-1 merged (first PR is the F2 skeleton)
- **Deliver:** Zod schemas for every request, response, query and error body ported from the Pydantic models; OpenAPI generation and the CI drift check.
- **Verify (report real results):** `npm run gen:openapi && git diff --exit-code docs/openapi/v1.json`.
- **PR:** base `feat/multi-platform`, `Refs: MP-13`, slice id `B1` in the description.

### C1 -- Web platform layer (MP-16)

- **Work-package document:** `docs/multi-platform/16-ui-platform-layer.md` · **Size:** L
- **Branch name:** `feat/web-platform-layer`
- **Touch only:** `apps/web/src/platform/**`, `apps/web/src/styles/**`, `apps/web/src/components/ui/Dialog.tsx` (back handler), `apps/web/src/components/layout/**`
- **Needs merged first:** W1-1 merged (first PR is the `Platform` half of F3)
- **Deliver:** `Platform` port with web implementation, self-hosted fonts, token and UI persistence behind Platform, back-button stack, safe areas, shortcut hints off on touch, CSP.
- **Verify (report real results):** `cd apps/web && npm run typecheck && npm run lint && npm test && npm run build`; no third-party requests at startup.
- **PR:** base `feat/multi-platform`, `Refs: MP-16`, slice id `C1` in the description.

### E1 -- Server skeleton, Docker, self-hosting guide (MP-14)

- **Work-package document:** `docs/multi-platform/14-server-cloud-mode.md` · **Size:** L
- **Branch name:** `feat/server-skeleton`
- **Touch only:** `apps/server/**`, `docs/self-hosting.md`
- **Needs merged first:** W1-1 and F1 merged; a stub `createApi` until the real one exists
- **Deliver:** Config parser, startup sequence (lock, open DB, migrate), backup CLI, static web hosting, Dockerfile and compose with Caddy, "Run it on your own computer" guide.
- **Verify (report real results):** `npm test -w @monetary/server`; docker image boots and serves the UI at `http://localhost:8000`.
- **PR:** base `feat/multi-platform`, `Refs: MP-14`, slice id `E1` in the description.

### D1 -- Capacitor Android scaffold and SQLite plugin (MP-20)

- **Work-package document:** `docs/multi-platform/20-android-app.md` · **Size:** L
- **Branch name:** `feat/android-scaffold`
- **Touch only:** `apps/mobile/**`, `packages/sqlite-capacitor/**`
- **Needs merged first:** W1-1 and F1 merged; spike S1/S2/S8 results
- **Deliver:** Capacitor project, mobile web build mode, manifest/permission allow-list check, Gradle hardening, `sqlite-capacitor` per the spike outcome and passing conformance on an emulator.
- **Verify (report real results):** `./gradlew assembleRelease`; `check-permissions.sh`; driver conformance on an emulator.
- **PR:** base `feat/multi-platform`, `Refs: MP-20`, slice id `D1` in the description.

### E2 -- Release workflow, signing and store docs (MP-23)

- **Work-package document:** `docs/multi-platform/23-distribution.md` · **Size:** M
- **Branch name:** `feat/release-workflow`
- **Touch only:** `.github/workflows/release-*.yml`, `docs/{signing,privacy-policy,store-listing}.md`, `apps/mobile/fastlane/**`
- **Needs merged first:** W1-1 merged
- **Deliver:** Release workflow skeleton with verification gates, signing guide (no secrets), fastlane metadata, privacy policy and store-listing drafts, versionCode script.
- **Verify (report real results):** Dry run on a pre-release tag with a test key (owner runs); `./scripts/versioncode.sh --check`.
- **PR:** base `feat/multi-platform`, `Refs: MP-23`, slice id `E2` in the description.

### A3 -- Core services: users, accounts, transactions, tags (MP-11 rows 10-11)

- **Work-package document:** `docs/multi-platform/11-core.md` · **Size:** L
- **Branch name:** `feat/core-services-accounts-transactions`
- **Touch only:** `core/src/application/{user,account,transaction,tag,seed}*`, matching `core/src/storage/*Repo.ts`
- **Needs merged first:** A1, A2 merged
- **Deliver:** Services and repositories ported with identical behavior; parity scenarios for these areas pass.
- **Verify (report real results):** `npm test -w @monetary/core`; `npm run test:parity`.
- **PR:** base `feat/multi-platform`, `Refs: MP-11`, slice id `A3` in the description.

### A4 -- Core services: transfers, splits, settlements, friends (MP-11 row 12)

- **Work-package document:** `docs/multi-platform/11-core.md` · **Size:** L
- **Branch name:** `feat/core-services-friends`
- **Touch only:** `core/src/application/{transfer,split,settlement}*`
- **Needs merged first:** A1, A2, A3 merged
- **Deliver:** Friend flows ported, including fronted-expense allocation order and settlement guards.
- **Verify (report real results):** `npm test -w @monetary/core`; `npm run test:parity`.
- **PR:** base `feat/multi-platform`, `Refs: MP-11`, slice id `A4` in the description.

### A5 -- Core services: budgets, statements, dashboard, reports (MP-11 row 13)

- **Work-package document:** `docs/multi-platform/11-core.md` · **Size:** L
- **Branch name:** `feat/core-reports`
- **Touch only:** `core/src/application/{budget,statement,reconcile,dashboard,trends,reports}*`
- **Needs merged first:** A1, A3 merged
- **Deliver:** All report engines ported; float results within the documented tolerance.
- **Verify (report real results):** `npm run test:parity` across several host time zones.
- **PR:** base `feat/multi-platform`, `Refs: MP-11`, slice id `A5` in the description.

### B2a -- API routes: setup, auth, owner (MP-13)

- **Work-package document:** `docs/multi-platform/13-api-contract.md` · **Size:** M
- **Branch name:** `feat/api-auth-routes`
- **Touch only:** `packages/api/src/routes/{setup,auth,owner}/**`, `packages/api/src/{middleware,errors}/**`
- **Needs merged first:** B1 (F2) merged; A3 service interfaces (stub until merged)
- **Deliver:** `createApi` skeleton, error mapping, middleware, rate limiter, `/health`, `/meta`, auth policies.
- **Verify (report real results):** `npm test -w @monetary/api -- --coverage`.
- **PR:** base `feat/multi-platform`, `Refs: MP-13`, slice id `B2a` in the description.

### B2b -- API routes: accounts, categories, tags (MP-13)

- **Work-package document:** `docs/multi-platform/13-api-contract.md` · **Size:** M
- **Branch name:** `feat/api-accounts-routes`
- **Touch only:** `packages/api/src/routes/{accounts,categories,tags}/**`
- **Needs merged first:** B1, B2a skeleton merged
- **Deliver:** Routes with no business logic, validated through `contract` schemas.
- **Verify (report real results):** `npm test -w @monetary/api`.
- **PR:** base `feat/multi-platform`, `Refs: MP-13`, slice id `B2b` in the description.

### B2c -- API routes: transactions, transfers, splits, settlements, friends (MP-13)

- **Work-package document:** `docs/multi-platform/13-api-contract.md` · **Size:** L
- **Branch name:** `feat/api-transaction-routes`
- **Touch only:** `packages/api/src/routes/{transactions,transfers,splits,settlements,friends}/**`
- **Needs merged first:** B1, B2a merged
- **Deliver:** All transaction-family routes including grouping, filters, idempotent client ids.
- **Verify (report real results):** `npm test -w @monetary/api`; parity scenarios through `createApi.fetch`.
- **PR:** base `feat/multi-platform`, `Refs: MP-13`, slice id `B2c` in the description.

### B2d -- API routes: reports (MP-13)

- **Work-package document:** `docs/multi-platform/13-api-contract.md` · **Size:** M
- **Branch name:** `feat/api-report-routes`
- **Touch only:** `packages/api/src/routes/reports/**`
- **Needs merged first:** B1, B2a merged; A5 services (stub until merged)
- **Deliver:** All report endpoints.
- **Verify (report real results):** `npm test -w @monetary/api`; parity report scenarios.
- **PR:** base `feat/multi-platform`, `Refs: MP-13`, slice id `B2d` in the description.

### C3 -- Client package and string-id migration (MP-15)

- **Work-package document:** `docs/multi-platform/15-client-and-transports.md` · **Size:** L
- **Branch name:** `feat/client-package`
- **Touch only:** `packages/client/**`, `apps/web/src/{lib/api,hooks,types}/**`
- **Needs merged first:** B1 (F2) merged; C1 `Platform` interface (F3)
- **Deliver:** `Transport`, `HttpTransport`, typed services moved from the web app, profiles and URL normalization, query keys with profile id, ids as strings across the web app.
- **Verify (report real results):** `npm test -w @monetary/client`; web typecheck, lint, 207 tests, build.
- **PR:** base `feat/multi-platform`, `Refs: MP-15`, slice id `C3` in the description.

### G1 -- Backup, export and import (MP-19)

- **Work-package document:** `docs/multi-platform/19-backup-export-import.md` · **Size:** L
- **Branch name:** `feat/archive-export-import`
- **Touch only:** `core/src/application/archive*`, `packages/api/src/routes/archive*`, `docs/archive-format.md`
- **Needs merged first:** A2, A3, A4 merged
- **Deliver:** Archive format, atomic import into an empty ledger, CSV export with injection guard, round-trip and tamper tests.
- **Verify (report real results):** `npm test -w @monetary/core -- archive`; round-trip test.
- **PR:** base `feat/multi-platform`, `Refs: MP-19`, slice id `G1` in the description.

### H1 -- Onboarding and mode flows (MP-17)

- **Work-package document:** `docs/multi-platform/17-onboarding-and-modes.md` · **Size:** L
- **Branch name:** `feat/onboarding-flows`
- **Touch only:** `apps/web/src/features/onboarding/**`, Settings data card
- **Needs merged first:** C1, C3, E1 merged
- **Deliver:** Server validation algorithm, error table, mode picker (native only), connect-server and local-setup screens, data settings.
- **Verify (report real results):** `cd apps/web && npm test && npm run test:e2e` (a11y checks included).
- **PR:** base `feat/multi-platform`, `Refs: MP-17`, slice id `H1` in the description.

### H2 -- Security items (MP-18)

- **Work-package document:** `docs/multi-platform/18-security-and-privacy.md` · **Size:** M
- **Branch name:** `feat/security-hardening`
- **Touch only:** redacting logger in `apps/server` and `packages/api`, `apps/web/src/platform/**` (app lock), CI audit/license steps
- **Needs merged first:** C1, E1 merged
- **Deliver:** Redacting logger and tests, app lock, `npm audit` and license-check CI, no-template-literal-SQL test.
- **Verify (report real results):** `npm audit --omit=dev && npm run check:licenses && npm run test:security`.
- **PR:** base `feat/multi-platform`, `Refs: MP-18`, slice id `H2` in the description.

### H3 -- Android completion: local runtime, platform, smoke tests (MP-20)

- **Work-package document:** `docs/multi-platform/20-android-app.md` · **Size:** L
- **Branch name:** `feat/android-local-runtime`
- **Touch only:** `packages/local-runtime/**`, `apps/web/src/platform/capacitorPlatform.ts`, `apps/mobile/**`
- **Needs merged first:** D1, A2, C1, C3 merged
- **Deliver:** `local-runtime` wiring, Capacitor platform plugins, emulator smoke tests (airplane mode), update-over-old-APK test, measured budgets.
- **Verify (report real results):** Emulator smoke suite; budgets recorded.
- **PR:** base `feat/multi-platform`, `Refs: MP-20`, slice id `H3` in the description.

### H4 -- Test infrastructure completion (MP-22)

- **Work-package document:** `docs/multi-platform/22-testing-and-parity.md` · **Size:** L
- **Branch name:** `test/e2e-and-perf`
- **Touch only:** `apps/web/e2e/**`, `tests/perf/**`, CI workflow files for these jobs
- **Needs merged first:** most of waves 2-3 merged
- **Deliver:** All parity scenarios green, Playwright e2e against the Node server, 50k-entry performance benchmarks on Node and Android.
- **Verify (report real results):** `npm run test:parity && npm run test:e2e`; benchmark table.
- **PR:** base `feat/multi-platform`, `Refs: MP-22`, slice id `H4` in the description.

### H5 -- Server integration tests and dev script switch (MP-14)

- **Work-package document:** `docs/multi-platform/14-server-cloud-mode.md` · **Size:** M
- **Branch name:** `test/server-integration`
- **Touch only:** `apps/server/**` tests, `scripts/dev.sh`, web integration test setup
- **Needs merged first:** B2a-d, A3-A5 merged
- **Deliver:** Real-HTTP API suite on the Node server, `scripts/dev.sh` runs the Node server, web integration tests green.
- **Verify (report real results):** `npm test -w @monetary/server && cd apps/web && npm run test:integration`.
- **PR:** base `feat/multi-platform`, `Refs: MP-14`, slice id `H5` in the description.

### W5-1 -- Cut-over: delete the Python backend (M9)

- **Work-package document:** `docs/multi-platform/25-roadmap.md` · **Size:** M
- **Branch name:** `chore/remove-python-backend`
- **Touch only:** `backend/**`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/LIVE_SCHEMA.sql`, `AGENTS.md`, CI
- **Needs merged first:** all parity scenarios green; owner confirms no v0.5 users
- **Deliver:** Delete `backend/`, rewrite architecture/API/schema docs for v1, update agent rules and CI.
- **Verify (report real results):** Full CI green without the backend job; fresh-clone build from the README.
- **PR:** base `feat/multi-platform`, `Refs: MP-25`, slice id `W5-1` in the description.

### W5-2 -- Apply Apache-2.0 and public README (MP-24)

- **Work-package document:** `docs/multi-platform/24-open-source-readiness.md` · **Size:** S
- **Branch name:** `chore/apply-license`
- **Touch only:** `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `README.md`, `CONTRIBUTING.md`, package metadata
- **Needs merged first:** **owner approval** (copyright-holder check)
- **Deliver:** License swap, notices generation, DCO check, public README.
- **Verify (report real results):** `npm run check:licenses`.
- **PR:** base `feat/multi-platform`, `Refs: MP-24`, slice id `W5-2` in the description.

### W5-3 -- Release candidate (MP-23, MP-24)

- **Work-package document:** `docs/multi-platform/23-distribution.md` · **Size:** M
- **Branch name:** `chore/release-candidate`
- **Touch only:** release checklist, store listing, F-Droid recipe draft
- **Needs merged first:** everything above merged
- **Deliver:** Pre-release tag, signed artifacts, checklist run, F-Droid merge-request text and Play listing prepared for the owner.
- **Verify (report real results):** Release checklist ticked with real results.
- **PR:** base `feat/multi-platform`, `Refs: MP-23`, slice id `W5-3` in the description.

## Tasks

- [ ] Owner: connect each Claude account to the repo with push access (or fork workflow); confirm identity is configured in each environment.
- [ ] Owner: merge the plan PR into `feat/multi-platform` first, so accounts can read these documents.
- [ ] Orchestrator: keep a written record of which slice each account holds (a GitHub issue per slice, or a GitHub Project board).
- [ ] After the first wave of PRs, review this document and adjust slice sizes and queues to what actually happened.

## Acceptance criteria

- A fresh Claude account given only the first message (section 2) and one slice card can complete the slice and open a valid PR without further explanation.
- No two accounts hold overlapping paths at the same time.

## Files you may touch

This document and `docs/multi-platform/README.md` (index row).

## Out of scope

Choosing agent products or limits, automating hand-outs.
