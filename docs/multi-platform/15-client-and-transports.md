# 15 -- Client package and transports

> **ID** MP-15 · **Status** Draft · **Depends on** MP-13 · **Unblocks** MP-16, 17

**Agent brief.** Create `packages/client`: the `Transport` interface with an HTTP and an in-process implementation,
the typed service functions (moved out of `web/src/lib/api/`), and the profile model. Switch `web/` to use it. After this
document the UI is mode-agnostic: it asks for data and does not know where it comes from.

## Context

`web/src/lib/api/http.ts` today builds `fetch` calls against a build-time `appConfig.apiBaseUrl`, attaches a bearer token
from `localStorage`, aborts after a timeout, maps error bodies to `ApiError` and calls a registered handler on 401. Services
under `web/src/lib/api/services/*.ts` call it, and `mappers.ts`/`reportMappers.ts` convert wire types to UI types.
TanStack Query hooks live in `web/src/hooks/`.

## Requirements

1. **Transport port** (no DOM types in the public signature beyond standard `Request`/`Response`):

```ts
interface Transport {
  send(req: { method: string; path: string; query?: Record<string, unknown>;
              headers?: Record<string, string>; body?: unknown; form?: Record<string,string>;
              signal?: AbortSignal }): Promise<{ status: number; headers: Record<string,string>; body: unknown }>;
}
```

2. **`HttpTransport(baseUrl, { fetchImpl, timeoutMs })`**: wraps `fetch`; on mobile the `fetchImpl` may be CapacitorHttp (decided in the spike,
   see MP-14 req. 4). Applies the timeout; normalizes network failures into `NetworkError` (distinct from HTTP errors).
3. **`InProcessTransport(api)`**: builds a `Request` from the call and invokes `api.fetch(request)`; builds the response body the same way.
   Exported from a **separate entry point** `@monetary/client/in-process` so cloud-only bundles never include the core.
4. **Typed services** (`accounts`, `categories`, `friends`, `incomeSources`, `meta`, `reports`, `tags`, `transactions`, `auth`, later `archive`) take a
   `Transport` (via a small `createClient(transport, session)` factory) instead of importing a global. Types come from `@monetary/contract`.
5. **Session handling is a port**: `SessionStore { get(): token|null; set; clear }`, supplied by the host (web: Platform secure storage, MP-16).
   A 401 invokes `onUnauthorized` once (debounced), as today. In `local-trusted` mode there is no token.
6. **Profiles**: `Profile = { id: string; kind: "local" } | { id: string; kind: "cloud"; name: string; baseUrl: string }`, persisted through the Platform key-value store.
   `ProfileManager` exposes `list()`, `active()`, `setActive(id)`, `add()`, `remove()`, and emits change events. v1 UI exposes one local + one cloud profile.
7. **Cache safety**: all TanStack Query keys include `profile.id`; switching profile calls `queryClient.clear()`; no cached ledger data may survive a switch or a logout.
8. **Errors**: keep `ApiError` fields (`status`, `errorType`, `detail`) so existing UI error handling keeps working. Add `NetworkError`, `IncompatibleServerError`, `DatabaseTooNewError`.
9. **URL normalization** helper `normalizeServerUrl(input)`: trim; add `https://` if no scheme; strip trailing slashes and a trailing `/api/v1`; reject credentials in the URL, query and fragment; lowercase host; return `{ ok, url } | { ok:false, reason }`. Unit-test hard (IPv6, ports, paths, unicode hosts).
10. **Request headers**: send `X-Monetary-Client: web/<version> api=1` (add `android`/`ios` via Platform info).

## Design

```text
packages/client/src/
  transport/ http.ts  inProcess.ts  types.ts
  services/  accounts.ts ...         // moved from web/src/lib/api/services
  mappers/   (moved from web/src/lib/api/mappers*.ts)
  profile/   manager.ts  types.ts  normalizeUrl.ts
  session.ts errors.ts index.ts
```

The `web/` composition root (`web/src/platform/runtime.ts`) reads the active profile and builds either
`HttpTransport` or the local runtime (core + driver + `createApi` + `InProcessTransport`) and provides the resulting `client` through React context.
React hooks (`web/src/hooks/queries.ts`, `mutations.ts`) keep living in `web/` but call `useClient()` instead of importing services.

## Tasks

- [ ] Create the package, the `Transport` port, `HttpTransport`, `InProcessTransport`, errors.
- [ ] Move services and mappers from `web/src/lib/api/`; keep thin re-exports in `web` until all imports are updated, then delete them.
- [ ] Introduce `ClientProvider` (React context) in `web/` and migrate hooks to `useClient()`.
- [ ] Implement `ProfileManager` + `normalizeServerUrl` with tests.
- [ ] Add profile id to all query keys; clear cache on switch/logout; test it.
- [ ] Switch ids from `number` to `string` across `web/src/types`, mappers and any numeric-id assumptions (sorting, route params, `Number(...)` casts); this lands with the API v1 switch.
- [ ] Update the web integration tests to run against the Node server via `HttpTransport` and add a variant using `InProcessTransport` with an in-memory driver.
- [ ] Keep all 207 existing web tests green (adjust only what the id change requires).

## Acceptance criteria

- The same React test-suite passes with a fake `Transport`, with `InProcessTransport` over an in-memory core, and (integration) with `HttpTransport` against the Node server.
- No file in `web/src/pages` or `web/src/components` imports `fetch`, `localStorage` for tokens, or `appConfig.apiBaseUrl`.
- Bundle check: a cloud-only build contains no `@monetary/core` code (inspect the Vite analysis in CI or a script that greps the output).
- Switching profile never shows the previous profile's data (test with two fake transports).
- `normalizeServerUrl` rejects a URL that embeds a username or password, `https://host/?x=1`, `ftp://host`, empty input.

## Files you may touch

`packages/client/**`, `web/src/lib/api/**` (moved/removed), `web/src/hooks/**`, `web/src/types/**`, `web/src/store/authStore.ts`, `web/src/platform/runtime.ts`, tests.

## Out of scope

Onboarding screens (MP-17), Platform storage implementations (MP-16), the SQL drivers.

## Verification

```bash
npm test -w @monetary/client && cd web && npm run typecheck && npm run lint && npm test && npm run build && npm run test:integration
```
