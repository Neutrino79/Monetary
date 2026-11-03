# ADR 0008: Web is server-backed (no browser database); repository restructured to `apps/` + `packages/`

- Status: **Accepted** (owner decision, 2026-11-02)
- Date: 2026-11-02
- Deciders: repository owner

## Context

An earlier draft gave the web app a "local mode" using SQLite in the browser's private file system (OPFS, via WASM). That needs a third SQL driver, a Web Worker, storage-persistence
handling, a larger browser test matrix, and mandatory export reminders because browsers can evict site data. The owner proposed pointing the web UI at a locally deployed server instead.

The owner also allowed any folder, including `web/` and `backend/`, to be restructured wherever it produces a cleaner end state, "no matter the rewrite".

## Decision

1. **The web app has no in-browser database.** It always talks to a Monetary server through `HttpTransport`. For personal, private use a web user runs the server on their own
   computer (Docker or Node), which serves the UI at `http://localhost:8000`. That is cloud mode pointed at a local server; `localhost` is a secure context, so no certificate is needed.
2. **True on-device local mode exists only in the native apps** (Android now, iOS later), through `InProcessTransport` over the Capacitor SQLite driver.
3. The `sqlite-wasm` driver, its Web Worker, web storage-persistence handling and the browser local-mode tests are removed from the plan. The `SqlDriver` port stays, so a browser driver remains possible later without touching the core.
4. The ledger core and API are **not bundled into the web build**. A new package `packages/local-runtime` wires core + api + the Capacitor driver into an `InProcessTransport` and is imported only by the mobile build (`VITE_TARGET=mobile`).
   `packages/client` therefore depends only on `contract`.
5. **Repository layout** becomes `apps/{web,server,mobile}` + `packages/*`. `web/` moves to `apps/web/` through a pure `git mv` PR (history preserved, all path references updated in the same PR).
   `backend/` stays at its path as frozen legacy until it is deleted at milestone M9. Further restructuring of folders (including inside `apps/web/src`) is allowed when a work package needs it;
   behavior-preserving moves and feature changes go in separate PRs.

## Consequences

- (+) One fewer driver, runtime and test matrix; no risk of the browser deleting someone's ledger; the web bundle stays small and free of ledger code.
- (+) "Local" web use gets real files, real backups (`monetary-server backup`) and the same server code as cloud mode.
- (+) Cleaner repo: apps and packages are clearly separated; boundaries are lint-enforceable per directory.
- (-) Web users must run a server for personal use. Mitigated by a one-command Docker/Node path, a clear "Run it on your own computer" guide and the Android app, which needs no server.
- (-) No zero-install try-it-in-the-browser demo. A hosted read-only demo server could be added later if wanted.
- (-) A one-time move PR touches many path references (AGENTS.md, CI, scripts, hooks); mitigated by making it a pure move with the full check suite as its acceptance test.

## Alternatives considered

- **Browser local mode with wa-sqlite + OPFS** (the earlier draft): works, but adds the costs above and still cannot guarantee data retention.
- **IndexedDB-backed store**: weaker query support and still evictable; rejected.
- **Keep `web/` and `backend/` where they are** to avoid churn: simpler move, but leaves a mixed layout (`web/` next to `apps/`-style `server/`, `mobile/`). The owner prefers the clean end state.
- **Move `backend/` to `legacy/backend/`**: no benefit while it is about to be deleted and its paths are used by CI and the fixture recorder.

## Verification / revisit when

After the move PR: root install, typecheck, lint, tests, build and boundary checks pass and `git log --follow` shows history. Revisit the no-browser-database decision only if users
ask for a no-install web demo or the self-hosting path proves too hard for the target audience.
