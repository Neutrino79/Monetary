# Monetary web app

React + TypeScript (Vite, TanStack Query, Zustand, Tailwind) front end for the Python backend in
`../monetary`. It holds **no ledger logic**: balances, net worth, budgets, friend balances, reports,
filtering, sorting and paging are all computed by the backend; the browser displays them, validates
forms for quick feedback, and sends the user's intent.

## Run

```bash
npm ci
cp .env.example .env.local          # VITE_API_BASE_URL points at the backend
npm run dev                         # http://localhost:5173
```

Start the backend first with `MONETARY_CORS_ORIGINS=http://localhost:5173` (see the root README).
The first visit shows the one-time setup screen; once an owner exists, setup is refused and the
app shows sign-in / password reset instead.

## Product name

The name comes from the backend (`MONETARY_APP_NAME`, via `GET /meta`) and is read through
`useBranding()`. `VITE_APP_NAME` is only the pre-load/unreachable fallback. To rename the product,
change the backend setting -- nothing in this folder needs editing.

## Layout

```
src/
  config/        app.ts (build-time config + fallbacks), nav.ts, timezones.ts
  lib/api/       http.ts (bearer token, error parsing, 401 handling), mappers.ts (wire <-> domain),
                 services/*  one module per backend resource
  hooks/         queries.ts / mutations.ts (TanStack Query), useLookups.ts (id -> entity)
  store/         authStore.ts (session), uiStore.ts (theme etc.)
  pages/ components/ routes/
  test/          unit + stubbed-network UI tests; integration/ runs against a real backend
```

Wire format: camelCase JSON, numeric ids, money as `{ points, major, currency }` (2-decimal minor
units). `lib/api/mappers.ts` is the only place that knows this; the rest of the app sees plain numbers
for display.

## Deployment

A static single-page app: `npm run build` emits `dist/`. Any host must serve `index.html` for unknown
paths (client-side routing) -- `vercel.json` (Vercel) and `public/_redirects` (Netlify-style hosts) already
carry that rewrite. Set `VITE_API_BASE_URL` at build time to the deployed backend, and add the app's origin
to the backend's `MONETARY_CORS_ORIGINS`.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `preview` | Vite |
| `npm run typecheck` / `lint` | `tsc -b --noEmit` / `oxlint` |
| `npm test` | unit and UI tests with a stubbed `fetch` |
| `npm run test:integration` | the real React app against a real uvicorn + temp SQLite (needs `pip install -r ../requirements.txt`) |
