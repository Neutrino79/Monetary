# Ledger App — React + TypeScript + Vite

Production frontend for the personal expense ledger. Data still comes from an
in-memory mock (`src/lib/api/mockApi.ts`); swapping in a real backend means
changing only that file (hooks in `src/hooks/` already use TanStack Query).

## Run

```bash
npm install
cp .env.example .env   # optional: rebrand / change currency
npm run dev            # http://localhost:5173
npm test               # integration tests (vitest + testing-library)
npm run build          # type-check + production bundle in dist/
```

Demo login: `ananya.kulkarni@example.com` / `demo1234`

## Configuration (no code changes needed)

Everything brand/locale related lives in `src/config/app.ts` and is
overridable via `.env` (see `.env.example`): app name, tagline, logo mark,
currency code/symbol, locale, default timezone. Navigation is data in
`src/config/nav.ts`; security questions in `src/config/security-questions.ts`.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 (tokens in `src/styles/index.css`)
· Radix UI (dialogs, drawers, toasts, tabs) · React Router · TanStack Query
· Zustand · lucide-react.

## Structure

```
src/
  config/       app branding/locale, nav, static option lists
  types/        domain types (mirror the DB schema)
  lib/db/       in-memory "database" + balance/budget calculators
  lib/api/      mockApi + mock auth  <-- the future backend seam
  hooks/        TanStack Query queries + mutations
  store/        Zustand: UI (theme, sidebar) and auth
  components/   ui/ (Radix-based primitives), layout/, domain/, charts/
  pages/        route components
  routes/       auth guards
```

## Ported so far

App shell, auth (login / signup / forgot password), Dashboard, Transactions
(search, filters, sorting, pagination, detail drawer, add/edit/delete/refund,
split with editable zero-able owner share). Remaining pages currently show a
placeholder: Income, Expenses, Transfers, Splits, Friends, Accounts,
Categories, Reports, Settings.

## Deploying

Uses real URL paths (not hashes), so the host must rewrite unknown paths to
`index.html`. `vercel.json` and `public/_redirects` (Netlify/Cloudflare) are
included; for nginx use `try_files $uri /index.html;`.
