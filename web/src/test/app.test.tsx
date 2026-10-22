/**
 * Route smoke test: every page renders for a signed-in owner and shows its own
 * heading, against a stubbed backend with empty data. (This file used to assert
 * against the in-browser mock database that the real API replaced.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import type { User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha Patil', email: 'asha@example.com', isSuperuser: true, timezone: 'UTC',
  homeCurrencyCode: 'INR', ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}

const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })

const routes: Record<string, unknown> = {
  '/meta': { appName: 'Monetary', tagline: 'Personal expense ledger', version: '0.5.0', apiVersion: 'v0.5' },
  '/accounts': [],
  '/categories': [],
  '/friends': [],
  '/friends/balances': [],
  '/transactions': { items: [], total: 0, limit: 12, offset: 0 },
  '/reports/dashboard': {
    year: 2026, month: 10,
    netWorth: [{ currency: 'INR', assets: money(0), liabilities: money(0), netWorth: money(0) }],
    summary: [{ currency: 'INR', income: money(0), expense: money(0), savings: money(0) }],
    accountBalances: [], budgetStatus: [], topSpending: [], incomeSummary: [], friendBalances: [],
    friendTotals: [{ currency: 'INR', owedToYou: money(0), youOwe: money(0) }],
  },
  '/reports/trends/cashflow': { currency: 'INR', points: [] },
  '/reports/spending': [],
  '/reports/income': [],
}

beforeEach(() => {
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v0\.5/, '')
    const body = path in routes ? routes[path] : { detail: `unhandled ${path}`, error_type: 'NotFoundError' }
    return new Response(JSON.stringify(body), { status: path in routes ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
  }))
})

afterEach(() => vi.unstubAllGlobals())

const PAGES: [string, string | RegExp][] = [
  ['/dashboard', /Good to see you, Asha/],
  ['/transactions', 'Transactions'],
  ['/expenses', 'Expenses'],
  ['/income', 'Income'],
  ['/transfers', 'Transfers'],
  ['/shared', 'Shared'],
  ['/friends', 'Friends'],
  ['/accounts', 'Accounts'],
  ['/categories', 'Categories'],
  ['/reports', 'Reports & Trends'],
  ['/settings', 'Settings'],
]

describe('every route renders for a signed-in owner', () => {
  it.each(PAGES)('%s', async (path, heading) => {
    window.history.pushState({}, '', path)
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expect(window.location.pathname).toBe(path)
  })

  it('sends an unknown URL to the dashboard', async () => {
    window.history.pushState({}, '', '/definitely-not-a-page')
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: /Good to see you/ })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/dashboard')
  })
})
