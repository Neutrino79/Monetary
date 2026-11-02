# 10 -- Monorepo and tooling

> **ID** MP-10 · **Status** Draft · **Depends on** MP-01 · **Unblocks** MP-11, 12, 13, 14, 15, 16

**Agent brief.** Turn the repository into an npm-workspaces monorepo and move `web/` to `apps/web/` (a pure move, first),
add empty but building packages with the dependency boundaries enforced by lint, and extend CI and
`scripts/check.sh` so every new package is tested. Do not write business logic here.

## Context

- Today: `apps/web/` is a standalone npm project (Node 22, Vite 8, Vitest 5, oxlint, TypeScript ~7). `backend/`
  is Python with its own tooling. `scripts/check.sh` runs backend checks; web checks are run by hand and in CI.
- `AGENTS.md` and `CONTRIBUTING.md` describe the layout and commands; they must be updated in the PR
  that adds packages (the Definition of Done requires docs to match structure).

## Requirements

1. npm **workspaces** at the repo root: `packages/*` and `apps/*` (`apps/web`, `apps/server`, `apps/mobile`). One root `package-lock.json`.
2. Every package is **ESM**, strict TypeScript, built with **TypeScript project references**
   (`tsc -b`). Libraries ship `dist/` JS + `.d.ts`; apps use Vite/Node directly.
3. **Boundary enforcement**: forbidden imports from [`01-architecture.md`](01-architecture.md#layering-and-dependency-rules-enforced-by-lint-see-mp-10)
   fail CI. Use `dependency-cruiser` (or an equivalent) with a checked-in rule file. Also forbid Node-only
   built-ins in packages not named `*-node` (an oxlint/ESLint `no-restricted-imports` rule or the same tool).
4. **One command per concern** from the repo root: `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run build`, `npm run check:boundaries`.
5. Node 22 LTS stays the minimum for development and the server image (revisit when the next LTS is
   current). Document it in `.nvmrc`/`engines`.
6. **Restructure freedom** (ADR-0008): the first PR of this document is a pure move: `git mv web apps/web` (history preserved), no behavior change, with every
   path reference updated in the same PR: `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, CI workflows, `scripts/*.sh`, the `web-lint` pre-commit hook, `.gitignore`,
   `.github/CODEOWNERS`, release-please config, `vercel.json`/hosting config. Later PRs may restructure folders inside `apps/web/src` when a work package needs it, but
   behavior-preserving moves and feature changes stay in separate PRs. `backend/` stays at its path until M9 (it is frozen and about to be deleted).
7. **Dependency policy**: new runtime dependencies need a one-line justification in the PR and must have an
   OSI-approved license (allow-list in MP-24). Pin via the lockfile; Dependabot already exists.

## Design

Root `package.json` (sketch, not final):

```json
{
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "npm run build -ws --if-present",
    "typecheck": "tsc -b",
    "lint": "oxlint",
    "test": "npm test -ws --if-present",
    "check:boundaries": "depcruise packages apps --config .dependency-cruiser.cjs"
  }
}
```

Package naming: scoped, private until published, e.g. `@monetary/core`. Each package exports through a
single `src/index.ts` (plus explicit subpath exports where needed, e.g. `@monetary/client/in-process`).

Test runner: **Vitest** everywhere (already used in `apps/web/`). Shared config in `vitest.workspace.ts`.
Coverage target for `packages/core` and `packages/api` is **>= 95%** (matches the backend's rule); other
packages follow `apps/web/`'s current practice.

CI (extend `.github/workflows/ci.yml`; do not weaken existing jobs):

| Job | Runs |
|---|---|
| `backend` | existing Python checks (kept until the legacy backend is deleted) |
| `ts` | install, `typecheck`, `lint`, `check:boundaries`, `test` with coverage, `build` |
| `web-integration` | existing app<->backend integration (switches to the Node server when ready) |
| `parity` | MP-22 fixture replay against `packages/api` (added with MP-22) |
| `android` | added by MP-20 (build debug APK; nightly: emulator smoke) |

`scripts/check.sh` gains the TS steps. `scripts/dev.sh inline` later starts the Node server instead of
uvicorn (once MP-14 is done); until then it keeps working unchanged.

## Tasks

- [ ] Add root `package.json` workspaces, `.nvmrc`, root `tsconfig.base.json`, `tsconfig.json` with references.
- [ ] **Move PR (first, pure move):** `git mv web apps/web`, make it a workspace member without changing its scripts, update every path reference listed in requirement 6; verify `npm ci` at the root works and the existing web typecheck, lint, 207 tests, build and integration tests still pass; `git log --follow` still shows history.
- [ ] Create empty packages with `package.json`, `tsconfig.json`, `src/index.ts`, one smoke test each: `contract`, `core`, `api`, `client`, `local-runtime`, `ui-logic`, `sqlite-node`, `sqlite-capacitor`; plus `apps/server/` and `apps/mobile/` (empty shells).
- [ ] Add `.dependency-cruiser.cjs` encoding rules 1-9 of MP-01; add a deliberately-bad fixture test proving each rule fails.
- [ ] Add Vitest workspace config and coverage thresholds for `core` and `api`.
- [ ] Extend `ci.yml` with the `ts` job; extend `scripts/check.sh`.
- [ ] Update `AGENTS.md` (project layout, commands, rule 8 for TS SQL location) and `CONTRIBUTING.md`; update `README.md` layout section.
- [ ] Add release-please config entries for the new packages (manifest mode) without altering the existing apps/web/backend versioning behavior; confirm with a dry run. **(verify)** how the current `release-please-config.json` is structured before editing.
- [ ] Update `.gitignore` for `packages/*/dist`, `apps/mobile/android/**/build`, `*.keystore`, `*.jks`.

## Acceptance criteria

- `npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run check:boundaries` passes at the root.
- `cd apps/web && npm run typecheck && npm run lint && npm test && npm run build` passes after the move, and `git log --follow apps/web/src/main.tsx` shows pre-move history.
- Introducing `import "@monetary/core"` inside `apps/web/src/pages/*` (outside the allowed composition file) fails `check:boundaries`.
- `pre-commit run --all-files` passes; no secrets or build output committed.
- `AGENTS.md` layout/commands match reality.

## Files you may touch

Root config files, `packages/*/` scaffolding, `apps/server/` scaffolding, `.github/workflows/ci.yml`,
`scripts/check.sh`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `.gitignore`, `.github/release-please-config.json`.
The move PR may rename `web/` and update references to it; it must not change `web/src/**` behavior. Do **not** change `backend/**`.

## Out of scope

Publishing packages to npm; any business logic; behavior changes to the web app.

## Verification

```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run check:boundaries
cd apps/web && npm run typecheck && npm run lint && npm test && npm run build
pre-commit run --all-files
```
