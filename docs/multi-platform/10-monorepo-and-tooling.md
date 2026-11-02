# 10 -- Monorepo and tooling

> **ID** MP-10 · **Status** Draft · **Depends on** MP-01 · **Unblocks** MP-11, 12, 13, 14, 15, 16

**Agent brief.** Turn the repository into an npm-workspaces monorepo without moving `web/` or `backend/`,
add empty but building packages with the dependency boundaries enforced by lint, and extend CI and
`scripts/check.sh` so every new package is tested. Do not write business logic here.

## Context

- Today: `web/` is a standalone npm project (Node 22, Vite 8, Vitest 5, oxlint, TypeScript ~7). `backend/`
  is Python with its own tooling. `scripts/check.sh` runs backend checks; web checks are run by hand and in CI.
- `AGENTS.md` and `CONTRIBUTING.md` describe the layout and commands; they must be updated in the PR
  that adds packages (the Definition of Done requires docs to match structure).

## Requirements

1. npm **workspaces** at the repo root: `packages/*`, `server`, `web`, `mobile`. One root `package-lock.json`.
2. Every package is **ESM**, strict TypeScript, built with **TypeScript project references**
   (`tsc -b`). Libraries ship `dist/` JS + `.d.ts`; apps use Vite/Node directly.
3. **Boundary enforcement**: forbidden imports from [`01-architecture.md`](01-architecture.md#layering-and-dependency-rules-enforced-by-lint-see-mp-10)
   fail CI. Use `dependency-cruiser` (or an equivalent) with a checked-in rule file. Also forbid Node-only
   built-ins in packages not named `*-node` (an oxlint/ESLint `no-restricted-imports` rule or the same tool).
4. **One command per concern** from the repo root: `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run build`, `npm run check:boundaries`.
5. Node 22 LTS stays the minimum for development and the server image (revisit when the next LTS is
   current). Document it in `.nvmrc`/`engines`.
6. Keep `web/` commands working exactly as in `AGENTS.md` (`cd web && npm run typecheck && ...`) so
   existing contributors and CI are not broken mid-migration.
7. **Dependency policy**: new runtime dependencies need a one-line justification in the PR and must have an
   OSI-approved license (allow-list in MP-24). Pin via the lockfile; Dependabot already exists.

## Design

Root `package.json` (sketch, not final):

```json
{
  "private": true,
  "workspaces": ["packages/*", "server", "web", "mobile"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "npm run build -ws --if-present",
    "typecheck": "tsc -b",
    "lint": "oxlint",
    "test": "npm test -ws --if-present",
    "check:boundaries": "depcruise packages server web --config .dependency-cruiser.cjs"
  }
}
```

Package naming: scoped, private until published, e.g. `@monetary/core`. Each package exports through a
single `src/index.ts` (plus explicit subpath exports where needed, e.g. `@monetary/client/in-process`).

Test runner: **Vitest** everywhere (already used in `web/`). Shared config in `vitest.workspace.ts`.
Coverage target for `packages/core` and `packages/api` is **>= 95%** (matches the backend's rule); other
packages follow `web/`'s current practice.

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
- [ ] Make `web/` a workspace member without changing its scripts; verify `npm ci` at root works and `web` tests still pass.
- [ ] Create empty packages with `package.json`, `tsconfig.json`, `src/index.ts`, one smoke test each: `contract`, `core`, `api`, `client`, `ui-logic`, `sqlite-node`, `sqlite-wasm`, `sqlite-capacitor`; plus `server/`.
- [ ] Add `.dependency-cruiser.cjs` encoding rules 1-9 of MP-01; add a deliberately-bad fixture test proving each rule fails.
- [ ] Add Vitest workspace config and coverage thresholds for `core` and `api`.
- [ ] Extend `ci.yml` with the `ts` job; extend `scripts/check.sh`.
- [ ] Update `AGENTS.md` (project layout, commands, rule 8 for TS SQL location) and `CONTRIBUTING.md`; update `README.md` layout section.
- [ ] Add release-please config entries for the new packages (manifest mode) without altering the existing web/backend versioning behavior; confirm with a dry run. **(verify)** how the current `release-please-config.json` is structured before editing.
- [ ] Update `.gitignore` for `packages/*/dist`, `mobile/android/**/build`, `*.keystore`, `*.jks`.

## Acceptance criteria

- `npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run check:boundaries` passes at the root.
- `cd web && npm run typecheck && npm run lint && npm test && npm run build` still passes.
- Introducing `import "@monetary/core"` inside `web/src/pages/*` (outside the allowed composition file) fails `check:boundaries`.
- `pre-commit run --all-files` passes; no secrets or build output committed.
- `AGENTS.md` layout/commands match reality.

## Files you may touch

Root config files, `packages/*/` scaffolding, `server/` scaffolding, `.github/workflows/ci.yml`,
`scripts/check.sh`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `.gitignore`, `.github/release-please-config.json`.
Do **not** change `web/src/**` behavior or `backend/**`.

## Out of scope

Moving `web/` to `apps/web`; publishing packages to npm; any business logic.

## Verification

```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run check:boundaries
cd web && npm run typecheck && npm run lint && npm test && npm run build
pre-commit run --all-files
```
