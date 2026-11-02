# 01 -- Architecture

> **ID** MP-01 · **Status** Draft · **Depends on** MP-00 · **Unblocks** MP-10 and everything after

**Agent brief.** This is the map. It names every package, what may import what, and how a request
travels in each mode. Obey the dependency rules exactly: they are what keep local and cloud mode
identical and iOS cheap. Do not add a package or a cross-layer import that is not described here
without writing an ADR first.

## Target repository layout

Any folder may be moved or rewritten when a work package needs it (owner decision, [ADR-0008](adr/0008-web-server-backed-and-repo-restructure.md)).
Moves are done as pure `git mv` PRs with no behavior change so history survives. `backend/` stays where it is until it is deleted at milestone M9.

```text
apps/
  web/             React UI (moved from web/). Server-backed only. Gains: Platform layer, onboarding, profiles
  server/          Node entrypoint, config, Dockerfile, compose; serves the web UI. What users host (also on their own computer)
  mobile/          Capacitor project: android/ (ios/ later), fastlane metadata, native config only
packages/
  contract/        Zod schemas + inferred types + generated OpenAPI. Shared by everyone. No logic.
  core/            domain/ (pure rules)  application/ (services)  storage/ (ports, schema, migrations, SQL)
  api/             Hono app: routes, auth, error mapping. `createApi(deps) -> { fetch }`
  client/          Transport port, HttpTransport, typed service functions, profiles. Knows nothing about core.
  local-runtime/   Native local mode: wires core + api + sqlite-capacitor into an InProcessTransport (dynamic-imported by the mobile build only)
  ui-logic/        Pure view logic moved out of apps/web (budget plans, statement grouping, formatting)
  sqlite-node/     SQL driver for Node (server)
  sqlite-capacitor/ SQL driver for Capacitor (Android now, iOS later); wraps a native plugin
backend/           LEGACY Python API. Frozen. Source of parity fixtures. Deleted at milestone M9.
docs/multi-platform/   this plan
```

## Layering and dependency rules (enforced by lint, see MP-10)

```text
contract  <-  core  <-  api  <-  apps/server (Node)
   ^           ^         ^
   |           |         +---- local-runtime (native only: api + core + sqlite-capacitor -> InProcessTransport)
   |           +-- sqlite-node | sqlite-capacitor  (implement core's SqlDriver port)
   +---- client, ui-logic, apps/web, apps/mobile
```

Rules:

1. `contract` imports nothing from the repo.
2. `core/domain` imports nothing but TypeScript/standard JS. `core/application` imports `domain`, `contract`
   types and the **ports** in `core/storage`. `core/storage` holds the only SQL in the repo.
3. Drivers import only `core`'s `SqlDriver` interface types. Core never imports a driver.
4. `api` imports `core` and `contract`. It contains **no business rules**, only: parse request, call a
   service, map errors, shape the response. (Same rule the Python routers followed.)
5. `client` imports `contract` only. It has no dependency on `core`, `api` or any driver. `local-runtime`
   imports `core`, `api`, `client` (for the `Transport` type) and `sqlite-capacitor`, and is the only place that builds an `InProcessTransport`.
6. `apps/web` imports `client`, `ui-logic`, `contract`. It never imports `core`, `api` or a driver. The single exception is
   `apps/web/src/platform/localRuntime.ts`, which may `import()` `@monetary/local-runtime` behind the build-time constant
   `VITE_TARGET === "mobile"`, so the default web build contains no ledger core.
   except in the one composition file `apps/web/src/platform/localRuntime.ts` which wires local mode.
7. `mobile` contains no TypeScript business code. It is native config plus the build that copies `apps/web/dist`.
8. No package may use Node-only APIs (`fs`, `path`, `Buffer`) unless its name ends in `-node` or it is `apps/server/`.
9. **SQL appears only in `packages/core/src/storage/`** (extends `AGENTS.md` rule 8 to the new code).

## How a request flows

**Cloud mode**

```text
React component -> client service fn -> HttpTransport --HTTPS--> apps/server/ (Node)
   -> packages/api (auth, validate) -> core service -> SqlDriver(sqlite-node) -> SQLite file on the server
```

**Local mode (Android)**

```text
React component -> client service fn -> InProcessTransport -> packages/api (same code)
   -> core service -> SqlDriver(sqlite-capacitor) -> native plugin -> SQLite file in the app's private storage
```

**Web** always uses cloud mode: `HttpTransport` to a server. For personal use that server runs on the same computer
(`http://localhost:8000`, see MP-14) and serves the UI itself. The web build contains no database and no ledger code.

Authentication in local mode: the in-process transport attaches a trusted local session; the API app is
built with `authPolicy: "local-trusted"`. In cloud mode it is `authPolicy: "bearer"`. This is a
constructor option, not an `if` in business code. Optional app lock (PIN/biometric) is a UI gate, see MP-18.

## Data ownership

- The **API app + core** compute everything (balances, net worth, budgets, reports, filtering, paging).
- The **UI** displays and sends intent. No ledger math in `apps/web/` (existing rule). Pure *presentation*
  helpers (grouping rows by day, choosing a chart axis) live in `ui-logic` and may be unit-tested without a DOM.
- The **database** is the only persistent state for ledger data. Per-device UI preferences (theme,
  accent, density) live in the Platform key-value store, never in the ledger.

## Modes and profiles

A **profile** is `{ id, kind: "local" } | { id, kind: "cloud", baseUrl, name }`. The active profile
decides which transport is built. All query-cache keys include the profile id, and switching profile
clears the cache. v1 exposes one local profile and one cloud profile at a time; the data shape allows a list.
On web only `cloud` profiles exist; `local` profiles exist only in the native builds.

## Versioning contract

Three independent numbers, never conflated:

| Number | Where | Meaning |
|---|---|---|
| **App version** | semver, in `package.json` and the Android `versionName` | what users see |
| **API version** | `/api/v1`, plus `apiVersion` in `GET /meta` | wire compatibility; bumps only on breaking changes |
| **Schema version** | `schema_migrations` table | on-disk database shape; forward-only migrations |

The client checks `/meta` at connect time (MP-13, MP-17). A database newer than the app is refused.

## Sync-readiness

We do not build sync, but we keep the door open so it is not a rewrite later:

- Ids are client-generatable (UUIDv7 as text, *Proposed*, ADR-0004), so two devices never collide.
- Every table has `created_at` and `updated_at` in UTC ISO-8601.
- The ledger is modelled so that edits can be expressed as new entries (STRICT mode already does this).
- A database carries a random `instance_id` in a `meta` table, so imports and future sync can recognise a dataset.

If, later, an owner wants sync, the likely route is an append-only change log per instance plus a
`/sync` endpoint. That is a separate ADR and not part of v1.

## Cross-cutting decisions (full text in `adr/`)

| ADR | Decision | Status |
|---|---|---|
| 0001 | One TypeScript core, API runs in-process (local) or on Node (cloud); Python becomes legacy | Proposed |
| 0002 | Capacitor shell around the one React UI; React Native deferred | **Accepted** |
| 0003 | SQL driver port, forward-only migrations, two drivers | Proposed |
| 0004 | Ids, money, time rules for the port | Proposed |
| 0005 | License | Proposed |
| 0006 | Distribution and signing | Proposed |
| 0007 | Contract-first with Zod and generated OpenAPI | Proposed |
| 0008 | Web is server-backed (no browser database); repository restructured to `apps/` + `packages/` | **Accepted** |

## Things that look tempting and are rejected

- **Two UIs** (React web + React Native/Kotlin/Swift): doubles feature cost forever. See ADR-0002.
- **Android-only embedded Python (Chaquopy)**: Android works, iOS does not, so local mode would be
  rewritten later anyway.
- **Business logic in the web app for local mode**: breaks the "UI holds no ledger logic" rule and
  forks behavior between modes.
- **A local-mode-only second implementation of reports**: guarantees drift. One core only.
- **Telemetry or crash reporting by default**: against the project's privacy promise.
