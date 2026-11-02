# 13 -- API contract (`/api/v1`) and the `api` package

> **ID** MP-13 · **Status** Draft · **Depends on** MP-11 · **Unblocks** MP-14, 15

**Agent brief.** Define the HTTP contract once as Zod schemas in `packages/contract`, generate the OpenAPI
document from it, and implement `packages/api`: a `fetch(Request) -> Response` application that exposes the core
over that contract. It must be runnable both in Node (behind a socket) and in-process (called directly), with no
`if (local)` branches. Business rules never go here.

## Context

The existing API is documented in `docs/API.md` (`/api/v0.5`). The web app (`web/src/lib/api/`) already
consumes it through typed services. The v1 contract is **the same resource map and the same wire conventions**
with the specific differences listed below, so the UI change is small.

## Carried over unchanged

camelCase JSON (snake_case accepted on input), money as `{points, major, currency}` in responses and decimal
strings in requests, `YYYY-MM-DD` local dates, inclusive date filters, partial `PATCH` semantics (omit = leave,
`null` = clear), the error body `{detail, error_type}` and the error-type -> HTTP-status table, `GET /transactions`
filters/grouping/paging, tags, friends, settlements, reports, security headers, docs exposure toggle, rate limiting on auth routes.
Use `docs/API.md` as the behavioral reference; the fixtures (MP-22) are the proof.

## Differences from v0.5 (each needs an entry in `parity-exceptions.md`)

| Area | v0.5 | v1 | Reason |
|---|---|---|---|
| Base path | `/api/v0.5` | `/api/v1` | breaking id change |
| Ids | integers | opaque **strings** (UUIDv7) | client-generated ids, merge/import, sync-readiness (Q2) |
| `GET /meta` | name, tagline, version | + `apiVersion`, `schemaVersion`, `minClientApi`, `capabilities[]`, `instanceId`, `auth: "bearer" \| "local"` | connect-time validation (below) |
| Create ids | server assigns | server accepts an optional client `id` on `POST` (idempotent: same id + same body = same response; same id + different body = 409) | offline-safe creation, retries |
| `POST /import`, `GET /export` | -- | new (MP-19) | local <-> cloud moves, backups |
| Local mode auth | -- | `auth: "local"` means no token needed from an in-process caller | local mode |

The numeric-to-string id change touches `web/src/types` and the mappers; that work is in MP-15 and must land with the API switch.

## Requirements

1. **Schemas first.** `packages/contract` exports Zod schemas for every request, response, query and error body, and
   `z.infer` types. `api` validates input with them and builds responses through them. No hand-written duplicate types.
2. **OpenAPI** is generated from the schemas (`@hono/zod-openapi` or equivalent) into `docs/openapi/v1.json`
   by `npm run gen:openapi`. CI fails if the committed file is stale. `docs/API.md` is rewritten as the human guide for v1 in the PR
   that makes v1 live; until then it describes the legacy v0.5.
3. **`createApi(deps)`** returns `{ fetch }` where `deps = { db: SqlDriver, clock, ids, hasher, config }` and
   `config = { authPolicy: "bearer" | "local-trusted", appName, tagline, version, corsOrigins, enableDocs, rateLimit }`.
4. **Auth**: `bearer` policy implements `setup/*` and `auth/*` exactly as v0.5 (login form-encoded OAuth2 password flow;
   7-day sessions; token SHA-256 hashed at rest; `change-password`/`reset-password` invalidate all sessions). `local-trusted` skips token
   checks but keeps `setup/init` (first run still creates the owner: name, currency, timezone).
5. **Error mapping**: domain error class -> `{detail, error_type}` + status, same table as v0.5. Unhandled errors become a generic
   500 `InternalError` with no stack trace to the client; the cause is logged via an injected `logger`.
6. **Middleware** (cloud policy only where noted): security headers, CORS from config, request size limit, per-IP rate limiter on
   login/reset (10 attempts / 5 min default, configurable), request id.
7. **Idempotent create** using client ids (above) with a stored hash of the request body for the conflict check.
8. **Handshake**: `GET /meta` is public and cheap. The client sends header `X-Monetary-Client: <app>/<version> api=<n>`; the server may
   log it but must not require it. The compatibility rule is in MP-17.
9. **Pagination and limits** unchanged (`limit` max 500).
10. **No behavior in routes**: a route handler is <= ~15 lines: parse -> service call -> serialize.

## `GET /meta` (v1 shape)

```json
{
  "app": "monetary",
  "name": "Monetary",
  "tagline": "Personal expense ledger",
  "version": "1.0.0",
  "apiVersion": 1,
  "minClientApi": 1,
  "schemaVersion": 1,
  "capabilities": ["export", "import", "tags", "reports.v1"],
  "instanceId": "0193...",
  "auth": "bearer",
  "initialized": true
}
```

`app` is a fixed string so the client can tell a Monetary server from any other web server. `initialized` replaces a second round trip to
`/setup/status` (keep that route for compatibility with scripts).

## Tasks

- [ ] Scaffold `packages/contract` with a schema per resource; port field names/validation rules from `backend/monetary/presentation/api/schemas/*.py` (including `Field` constraints, patterns and descriptions).
- [ ] Generate OpenAPI; commit `docs/openapi/v1.json`; add the CI drift check.
- [ ] Implement `createApi` skeleton: error mapping, middleware, `/health`, `/meta`.
- [ ] Implement routers in the order of MP-11's services (setup/auth/owner, accounts/categories, transactions/tags, transfers/splits/settlements/friends, reports). Port each router from `backend/monetary/presentation/api/routers/*.py`.
- [ ] Implement client-supplied ids + idempotency.
- [ ] Implement rate limiter (in-memory token bucket keyed by IP; injected storage for tests).
- [ ] API-level tests mirroring `backend/tests/api`: run them against `createApi` with an in-memory driver and `app.request(...)` (no sockets).
- [ ] Rewrite `docs/API.md` for v1 in the PR that makes it live; keep a short "legacy v0.5" note until the Python backend is deleted.
- [ ] Add `docs/multi-platform/parity-exceptions.md` rows for every difference above.

## Acceptance criteria

- Every recorded parity scenario (MP-22) passes through `createApi.fetch` with the declared id normalization.
- The same test-suite passes with `authPolicy: "bearer"` over a real Node HTTP server (MP-14) and with `"local-trusted"` in-process.
- `docs/openapi/v1.json` is up to date; schemas and types match with no hand-written duplicates (lint rule against `interface` clones in `web/src/types` is **not** required, but `web` must import types from `contract`).
- A route handler containing business logic (a service-level `if` on domain state) fails code review; boundary check forbids `api` importing `core/storage`.
- Coverage >= 95% for `packages/api`.

## Files you may touch

`packages/contract/**`, `packages/api/**`, `docs/openapi/**`, `docs/API.md` (v1 rewrite, per above), `docs/multi-platform/parity-exceptions.md`.

## Out of scope

Server process/config (MP-14), client changes (MP-15), sync endpoints, multi-user routes, GraphQL/WebSocket.

## Verification

```bash
npm run gen:openapi && git diff --exit-code docs/openapi/v1.json
npm test -w @monetary/api -- --coverage
npm run test:parity
```
