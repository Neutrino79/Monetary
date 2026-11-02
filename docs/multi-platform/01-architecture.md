# 01 -- Architecture

> **ID** MP-01 · **Status** Draft · **Depends on** MP-00 · **Unblocks** MP-10 and everything after

**Agent brief.** This is the map. It names every package, what may import what, and how a request
travels in each mode. Obey the dependency rules exactly: they are what keep local and cloud mode
identical and iOS cheap. Do not add a package or a cross-layer import that is not described here
without writing an ADR first.

## Target repository layout

Existing top-level folders keep their names to avoid churn (`web/`, `backend/`). New folders are added.

```text
packages/
  contract/        Zod schemas + inferred types + generated OpenAPI. Shared by everyone. No logic.
  core/            domain/ (pure rules)  application/ (services)  storage/ (ports, schema, migrations, SQL)
  api/             Hono app: routes, auth, error mapping. `createApi(deps) -> { fetch }`
  client/          Transport port, HttpTransport, InProcessTransport, typed service functions, profiles
  ui-logic/        Pure view logic moved out of web/ (budget plans, statement grouping, formatting)
  sqlite-node/     SQL driver for Node (server)
  sqlite-wasm/     SQL driver for browsers (wa-sqlite + OPFS, in a Web Worker)
  sqlite-capacitor/ SQL driver for Capacitor (Android now, iOS later); wraps a native plugin
server/            Node entrypoint, config, Dockerfile, compose, optional static web hosting
web/               React UI (existing). Gains: Platform layer, onboarding, runtime profile
mobile/            Capacitor project: android/ (ios/ later), fastlane metadata, native config only
backend/           LEGACY Python API. Frozen. Source of parity fixtures. Deleted at milestone M9.
docs/multi-platform/   this plan
```

## Layering and dependency rules (enforced by lint, see MP-10)

```text
contract  <-  core  <-  api  <-  server (Node)
   ^           ^         ^
   |           |         +---- client (InProcessTransport imports api)
   |           +-- sqlite-node | sqlite-wasm | sqlite-capacitor  (implement core's SqlDriver port)
   +---- client, ui-logic, web, mobile
```

Rules:

1. `contract` imports nothing from the repo.
2. `core/domain` imports nothing but TypeScript/standard JS. `core/application` imports `domain`, `contract`
   types and the **ports** in `core/storage`. `core/storage` holds the only SQL in the repo.
3. Drivers import only `core`'s `SqlDriver` interface types. Core never imports a driver.
4. `api` imports `core` and `contract`. It contains **no business rules**, only: parse request, call a
   service, map errors, shape the response. (Same rule the Python routers followed.)
5. `client` imports `contract`. Only its `InProcessTransport` entry point (a separate export, so it
   tree-shakes out of cloud-only builds) imports `api`.
6. `web` imports `client`, `ui-logic`, `contract`. It never imports `core`, `api` or a driver directly,
   except in the one composition file `web/src/platform/localRuntime.ts` which wires local mode.
7. `mobile` contains no TypeScript business code. It is native config plus the build that copies `web/dist`.
8. No package may use Node-only APIs (`fs`, `path`, `Buffer`) unless its name ends in `-node` or it is `server/`.
9. **SQL appears only in `packages/core/src/storage/`** (extends `AGENTS.md` rule 8 to the new code).

## How a request flows

**Cloud mode**

```text
React component -> client service fn -> HttpTransport --HTTPS--> server/ (Node)
   -> packages/api (auth, validate) -> core service -> SqlDriver(sqlite-node) -> SQLite file on the server
```

**Local mode (Android)**

```text
React component -> client service fn -> InProcessTransport -> packages/api (same code)
   -> core service -> SqlDriver(sqlite-capacitor) -> native plugin -> SQLite file in the app's private storage
```

**Local mode (web)** is the same, with `sqlite-wasm` running in a Web Worker so the UI thread never blocks.

Authentication in local mode: the in-process transport attaches a trusted local session; the API app is
built with `authPolicy: "local-trusted"`. In cloud mode it is `authPolicy: "bearer"`. This is a
constructor option, not an `if` in business code. Optional app lock (PIN/biometric) is a UI gate, see MP-18.

## Data ownership

- The **API app + core** compute everything (balances, net worth, budgets, reports, filtering, paging).
- The **UI** displays and sends intent. No ledger math in `web/` (existing rule). Pure *presentation*
  helpers (grouping rows by day, choosing a chart axis) live in `ui-logic` and may be unit-tested without a DOM.
- The **database** is the only persistent state for ledger data. Per-device UI preferences (theme,
  accent, density) live in the Platform key-value store, never in the ledger.

## Modes and profiles

A **profile** is `{ id, kind: "local" } | { id, kind: "cloud", baseUrl, name }`. The active profile
decides which transport is built. All query-cache keys include the profile id, and switching profile
clears the cache. v1 exposes one local profile and one cloud profile at a time; the data shape allows a list.

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
| 0003 | SQL driver port, forward-only migrations, three drivers | Proposed |
| 0004 | Ids, money, time rules for the port | Proposed |
| 0005 | License | Proposed |
| 0006 | Distribution and signing | Proposed |
| 0007 | Contract-first with Zod and generated OpenAPI | Proposed |

## Things that look tempting and are rejected

- **Two UIs** (React web + React Native/Kotlin/Swift): doubles feature cost forever. See ADR-0002.
- **Android-only embedded Python (Chaquopy)**: Android works, iOS does not, so local mode would be
  rewritten later anyway.
- **Business logic in the web app for local mode**: breaks the "UI holds no ledger logic" rule and
  forks behavior between modes.
- **A local-mode-only second implementation of reports**: guarantees drift. One core only.
- **Telemetry or crash reporting by default**: against the project's privacy promise.
