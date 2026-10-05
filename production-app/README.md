# Ledger App — React + TypeScript + Vite

Production frontend for the personal expense ledger. All 11 pages are built
and wired. Data comes from an in-memory mock backend by default; pointing
the app at a real backend is a one-line config change (see below) — no code
changes required.

## Run

```bash
npm install
cp .env.example .env   # optional: rebrand / change currency / set a backend URL
npm run dev            # http://localhost:5173
npm test               # integration tests (vitest + testing-library)
npm run build          # type-check + production bundle in dist/
```

Demo login: `ananya.kulkarni@example.com` / `demo1234`

## Connecting a real backend

Every request goes through `src/lib/api/services/*Service.ts`. Each service
checks `appConfig.useMockApi`: true routes to the in-memory mock backend
(`src/lib/api/mock/`), false routes to the real HTTP client
(`src/lib/api/http.ts`), which builds every URL from `appConfig.apiBaseUrl`.

To switch to a real backend, set **one value**:

```bash
# .env
VITE_API_BASE_URL=https://api.example.com/v1
```

That's it — `useMockApi` automatically flips to `false` once a base URL is
set (or force it explicitly with `VITE_USE_MOCK_API=false`/`true`). No
service, hook, component or page needs to change. Auth uses a bearer token
(`src/lib/api/tokenStorage.ts`) attached automatically to every real request;
swap that module for httpOnly-cookie auth later without touching callers.

Each service file documents the REST endpoint shape it expects
(`GET /accounts`, `POST /transactions`, etc.) in its header comment — that's
the contract a real backend needs to implement.

## Configuration (no code changes needed)

Everything brand/locale/backend related lives in `src/config/app.ts` and is
overridable via `.env` (see `.env.example`): app name, tagline, logo mark,
currency code/symbol, locale, default timezone, backend URL, mock-mode
toggle, request timeout, mock network latency. Navigation is data in
`src/config/nav.ts`; security questions in `src/config/security-questions.ts`.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 (tokens in `src/styles/index.css`)
· Radix UI (dialogs, drawers, toasts, tabs) · React Router · TanStack Query
· Zustand · lucide-react.

## Structure

```
src/
  config/         app branding/locale/backend config, nav, static option lists
  types/          domain types (mirror the DB schema) + API request/response shapes
  lib/utils/      formatting, the shared clock (today()), misc helpers
  lib/domain/     pure ledger math (balances, budgets, category spend) — no I/O
  lib/api/
    mock/           the mock backend's internals (private — not imported outside here)
    services/       the ONE routing layer every hook/component calls through
    http.ts         real fetch client, built from appConfig.apiBaseUrl
    tokenStorage.ts bearer-token storage, isolated so it's swappable
    errors.ts       normalized ApiError
  hooks/          TanStack Query queries/mutations + useLedgerCalc (binds
                  lib/domain to live query data)
  store/          Zustand: UI (theme, sidebar) and auth
  components/     ui/ (Radix-based primitives), layout/, domain/, charts/
  pages/          route components — all 11 pages are implemented
  routes/         auth guards (handles the async hydration flow too)
```

## Pages

Dashboard, Transactions, Income, Expenses, Transfers, Splits, Friends,
Accounts, Categories, Reports & Trends, Settings — all implemented, all
routed with `React.lazy()` code-splitting.

## Deploying

Uses real URL paths (not hashes), so the host must rewrite unknown paths to
`index.html`. `vercel.json` and `public/_redirects` (Netlify/Cloudflare) are
included; for nginx use `try_files $uri /index.html;`.
