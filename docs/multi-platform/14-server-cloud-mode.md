# 14 -- Server and cloud mode (self-hosted)

> **ID** MP-14 · **Status** Draft · **Depends on** MP-12, MP-13 · **Unblocks** MP-17 (cloud onboarding), MP-20

**Agent brief.** Build `apps/server/`: a small Node program that runs `packages/api` with the `sqlite-node` driver, reads its
configuration from `MONETARY_*` environment variables, and ships as a Docker image with a reverse-proxy example. It is what
a user hosts for cloud mode. Keep it boring, secure by default and trivial to run on a cheap VPS or a home server.

## Context

Cloud mode means "the user hosts their own backend". There is no Monetary-run service. The server is therefore a
product surface: its setup docs, defaults and upgrade story decide whether non-experts can use cloud mode at all.

Existing configuration names are kept (see `backend/.env.example` and `backend/monetary/config.py`):
`MONETARY_ENV`, `MONETARY_DB_PATH`, `MONETARY_CORS_ORIGINS`, `MONETARY_ENABLE_DOCS`, `MONETARY_APP_NAME`,
`MONETARY_APP_TAGLINE`, `MONETARY_SEED_DEFAULTS_PATH`. New variables below are **additions**: per `AGENTS.md` rule 7 they must be
documented in `backend/.env.example` (or the new `apps/server/.env.example`) and the README in the same PR.

## Requirements

1. **Process**: `node apps/server/dist/main.js` starts an HTTP server (Node's `http` via a small adapter, or `@hono/node-server`) on
   `MONETARY_HOST` (default `0.0.0.0` in the container, `127.0.0.1` otherwise) and `MONETARY_PORT` (default `8000`).
2. **Configuration** (all optional except where noted):

| Variable | Default | Meaning |
|---|---|---|
| `MONETARY_ENV` | `production` | `development` enables docs and verbose logs |
| `MONETARY_DB_PATH` | `/data/monetary.db` (container) | SQLite file; directory must be writable |
| `MONETARY_CORS_ORIGINS` | empty (no browser origin allowed) | comma list; native app origins are handled separately (below) |
| `MONETARY_ENABLE_DOCS` | `false` | serve `/docs`, `/openapi.json` |
| `MONETARY_APP_NAME`, `MONETARY_APP_TAGLINE` | `Monetary`, `Personal expense ledger` | branding in `/meta` |
| `MONETARY_SEED_DEFAULTS_PATH` | built-in | custom default categories |
| `MONETARY_HOST`, `MONETARY_PORT` | see above | bind address |
| `MONETARY_SERVE_WEB` | `true` in the image | serve the built web app from the same origin (removes CORS for the web UI) |
| `MONETARY_WEB_DIR` | `/app/web` | location of the web build |
| `MONETARY_TRUST_PROXY` | `false` | trust `X-Forwarded-*` from a reverse proxy (for client IP in rate limiting) |
| `MONETARY_SESSION_DAYS` | `7` | session lifetime |
| `MONETARY_LOG_LEVEL` | `info` | `error`/`warn`/`info`/`debug` |

3. **Refuse insecure production defaults**: in `production`, if `MONETARY_TRUST_PROXY` is unset and the request arrives
   over plain HTTP from a non-private address, log a clear warning at startup explaining that TLS must be terminated by a proxy.
   HSTS is sent only when `MONETARY_ENV=production` (existing behavior).
4. **Native app origins**: the Android/iOS apps use Capacitor. Prefer making API calls from the native side (CapacitorHttp) so CORS does
   not apply **(verify in spike)**; if the WebView `fetch` is used instead, the server must allow Capacitor's origins
   (`https://localhost`, `capacitor://localhost` **(verify exact values)**) via a dedicated `MONETARY_ALLOW_NATIVE_APPS=true` option, default `true`.
5. **Single writer**: exactly one server process per database file. On startup, take an advisory lock (lock file next to the DB) and
   exit with a clear error if another instance holds it.
6. **Migrations on boot**: run pending migrations (MP-12) with the pre-migration backup; refuse to start on `DatabaseTooNew`.
7. **Backups**: `monetary-server backup <path>` CLI subcommand (uses `VACUUM INTO`); docs show a cron example and how to restore. Also exposed
   as the authenticated `GET /export` (MP-19).
8. **Health**: `GET /health` (liveness + DB connectivity), unchanged semantics.
9. **Graceful shutdown**: on `SIGTERM`, stop accepting connections, finish in-flight requests, close the DB.
10. **Logging**: structured JSON lines to stdout; never log request bodies, tokens, passwords or amounts (MP-18).
11. **Passwords**: scrypt via Node `crypto.scrypt` with per-secret random salt and stored parameters (e.g. `scrypt$N$r$p$salt$hash`) so
    parameters can be raised later; constant-time comparison. (Q15)
12. **Container**: multi-stage Dockerfile, non-root user, read-only root filesystem friendly, `/data` volume, `HEALTHCHECK`, small base image (Node LTS slim).
    Image published to GHCR by the release workflow (MP-23). Provide `docker-compose.yml` with a Caddy (or Traefik) service giving automatic HTTPS.
13. **Docs**: `docs/self-hosting.md` (new) covering: Docker quick start, Docker + Caddy HTTPS, bare Node/systemd, backups and restore, upgrades,
    connecting the apps, security checklist, troubleshooting by the error taxonomy of MP-17. Non-experts are the audience.

## Design notes

- `apps/server/src/main.ts` only wires: read config -> open driver -> run migrations -> `createApi` -> serve (+ static web). Business behavior stays in `core`/`api`.
- Static web hosting must set a strict CSP and `Cache-Control` (hashed assets immutable, `index.html` no-cache) and SPA fallback to `index.html`.
- Version skew: the server's `schemaVersion` and `apiVersion` are in `/meta`; the web UI it serves is built from the same release, so it always matches.
- **Personal use on your own computer** is what "local" means on web. `docker run -p 127.0.0.1:8000:8000 -v monetary:/data ...` or `node apps/server/dist/main.js` binds to
  `127.0.0.1`, serves the web UI at `http://localhost:8000`, and (outside a container) stores data in `~/.monetary/monetary.db`. Browsers treat `localhost` as a secure
  context, so no certificate is needed. Document optional start-at-login (systemd user unit, launchd, Windows Task Scheduler), backups and upgrades. Windows/macOS users
  may use Docker Desktop or plain Node. Later conveniences (not v1): a published npm package (`npx`) or a single-file binary **(verify Node single-executable support)**.
- **Recommended web path** is the UI served by the server itself (same origin, no CORS). A standalone-hosted web build can also point at a server, but then the server needs
  `MONETARY_CORS_ORIGINS` for that origin, and an HTTPS-hosted page cannot call a plain-HTTP LAN server (mixed content).

## Tasks

- [ ] `apps/server/` scaffold, config parser with validation and helpful errors, `.env.example`.
- [ ] Node HTTP adapter + static web hosting + SPA fallback + security headers/CSP.
- [ ] Startup sequence: lock, open DB, migrate (with backup), start; `backup` and `version` subcommands.
- [ ] scrypt `Hasher`; rate limiter wiring with `MONETARY_TRUST_PROXY`.
- [ ] Dockerfile, `docker-compose.yml` with Caddy, `.dockerignore`, healthcheck, GHCR publish job (coordinate with MP-23).
- [ ] `docs/self-hosting.md`, including a "Run it on your own computer" section (Docker and plain Node, start at login, backups, upgrades).
- [ ] Integration tests: boot the server on a temp DB and a random port; run the API test-suite over real HTTP; kill -TERM test; second-instance lock test.
- [ ] Switch `scripts/dev.sh` and `web` integration tests (`npm run test:integration`) to the Node server; keep the Python path until MP-25 milestone M9.

## Acceptance criteria

- `docker run -v monetary:/data -p 8000:8000 ghcr.io/<owner>/monetary` then opening `http://localhost:8000` shows the setup screen, and the full
  web flow works against it.
- Following only the "Run it on your own computer" section on Linux, macOS and Windows (Docker Desktop or Node), a user reaches the web UI at `http://localhost:8000`, creates the owner and adds a transaction; data survives a restart.
- `curl /api/v1/meta` returns the documented shape; `app` equals `monetary`.
- Two servers on one DB: the second exits non-zero with a clear message.
- Restoring a backup made by `monetary-server backup` into a fresh volume reproduces the data.
- No request body, token or amount appears in logs (test with a log capture).
- Image runs as non-root; `docker scan`/Trivy shows no critical findings on the base image at release time.

## Files you may touch

`apps/server/**`, `docs/self-hosting.md`, `.github/workflows/*` (the image job only), `scripts/dev.sh`, `README.md` (config table), `web` integration test setup.

## Out of scope

Kubernetes/Helm, multi-instance or HA, managed hosting, user management, TLS termination inside the app, auto-update.

## Verification

```bash
npm test -w /server
docker build -t monetary:dev -f apps/server/Dockerfile . && docker run --rm -p 8000:8000 -v "$PWD/.tmp-data:/data" monetary:dev
cd apps/web && npm run test:integration
```
