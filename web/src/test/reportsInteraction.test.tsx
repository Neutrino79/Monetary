/** Reports page interactions: readouts on hover, click-through to the matching transactions, selection in Compare. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ReportsPage } from '@/pages/ReportsPage'
import { TransactionTable } from '@/components/domain/TransactionTable'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { categorySpanLink, categoryMonthLink, monthLink } from '@/lib/utils/reportLinks'
import type { User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (major: number) => ({ points: Math.round(major * 100), major: `INR ${major.toFixed(2)}`, currency: 'INR' })

const months = [{ year: 2026, month: 8 }, { year: 2026, month: 9 }, { year: 2026, month: 10 }]
const totals = (i: number, e: number) => ({ income: money(i), expense: money(e), net: money(i - e), savingsRate: 50, averageIncome: money(i / 3), averageExpense: money(e / 3) })
const overview = {
  currency: 'INR', months: 3,
  points: months.map((m, i) => ({ ...m, isPartial: i === 2, income: money(60000), expense: money(30000 + i * 9000), net: money(30000 - i * 9000), savingsRate: 50 - i * 15, rollingExpense: money(32000), unusual: i === 2, versusUsualPct: i === 2 ? 42 : null })),
  previousPoints: months.map((m) => ({ ...m, income: money(1), expense: money(1), net: money(0), savingsRate: null })),
  current: totals(180000, 117000), previous: totals(3, 3),
  netWorth: months.map((m, i) => ({ ...m, assets: money(100000 + i * 5000), liabilities: money(2000), netWorth: money(98000 + i * 5000) })),
  incomeSources: [{ categoryId: 3, name: 'Salary', color: '#1F6D4C', points: [money(60000), money(60000), money(60000)] }],
  findings: [{ code: 'unusual_months', tone: 'watch', flagged: [{ year: 2026, month: 10, pct: 42 }] }],
}
const catRow = { categoryId: 7, name: 'Food', color: null, points: [money(9000), money(9500), money(14000)], current: money(14000), usual: { low: money(9000), median: money(9500), high: money(10000) }, state: 'above', versusUsualPct: 40, slope: money(2500), average: money(10000), previousAverage: money(8000), changePct: 25, sharePct: 60 }
const categories = {
  currency: 'INR', kind: 'spending', months: 3, seriesMonths: [...months, ...months].slice(0, 6).map((_, i) => ({ year: 2026, month: 5 + i })),
  categories: [catRow, { ...catRow, categoryId: 8, name: 'Rent', sharePct: 40, changePct: -5, state: 'normal' }],
  total: { average: money(20000), previousAverage: money(18000), changePct: 11.1 },
}
const compare = {
  currency: 'INR', a: { income: money(60000), expense: money(40000), kept: money(20000) }, b: { income: money(50000), expense: money(30000), kept: money(20000) },
  categories: [{ categoryId: 7, name: 'Food', color: null, a: money(25000), b: money(15000), change: money(10000), changePct: 66.7, shareOfChangePct: 100, purchasesA: 30, purchasesB: 20, averagePurchaseA: money(833), averagePurchaseB: money(750), volumeEffect: money(7500), ticketEffect: money(2500) }],
  volumeEffect: money(7500), ticketEffect: money(2500),
}
const history = {
  currency: 'INR', months: 3,
  budgets: [{ categoryId: 7, name: 'Food', color: null, limit: money(10000), points: [money(9000), money(11000), money(8000)], monthsOver: 1, held: 2, completeMonths: 3, typicalPct: 90, suggestion: { action: 'keep', limit: money(10000), recentOvershoot: money(0) } }],
  limitTotal: money(10000), monthTotals: months.map((m, i) => ({ ...m, isPartial: i === 2, spent: money([9000, 11000, 8000][i]!) })), unbudgeted: [], held: 2, budgetMonths: 3, coveragePct: 90,
}

let urls: URL[]
beforeEach(() => {
  urls = []
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    urls.push(url)
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    const bodies: Record<string, unknown> = {
      '/reports/overview': overview, '/reports/categories': categories, '/reports/compare': compare, '/reports/budget-history': history,
      '/transactions': { items: [], total: 0, limit: 25, offset: 0 },
    }
    return new Response(JSON.stringify(path in bodies ? bodies[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.pathname + l.search}</div>
}
function renderAt(url: string) {
  return render(
    <QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/reports" element={<ReportsPage />} /><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter></ToastProvider></QueryClientProvider>,
  )
}

describe('report links', () => {
  it('builds the transaction links', () => {
    expect(monthLink('2026-10')).toBe('/transactions?month=2026-10')
    expect(monthLink('2026-10', 'income')).toBe('/income?month=2026-10')
    expect(categoryMonthLink('spending', 7, '2026-10')).toBe('/expenses?category=7&month=2026-10')
    expect(categorySpanLink('spending', 7, { from: '2026-08', to: '2026-10' })).toBe('/expenses?category=7&from=2026-08&to=2026-10')
    expect(categorySpanLink('income', 7, { from: '2026-10', to: '2026-10' })).toBe('/income?category=7&month=2026-10')
  })
})

describe('Overview', () => {
  it('shows a readout when a month is hovered, and opens that month on click', async () => {
    renderAt('/reports?range=3M')
    const col = await screen.findByRole('link', { name: /September 2026: income .*spending/ })
    await userEvent.hover(col)
    const tip = await screen.findByRole('status')
    expect(within(tip).getByText('September 2026')).toBeInTheDocument()
    expect(within(tip).getByText('In')).toBeInTheDocument()
    expect(within(tip).getByText('Out')).toBeInTheDocument()
    expect(within(tip).getByText(/Kept/)).toBeInTheDocument()
    // like the dashboard: a dark card, and the other months step back instead of being covered
    expect(tip).toHaveClass('bg-ink')
    const others = col.closest('svg')!.querySelectorAll('g[opacity="0.45"]')
    expect(others.length).toBe(2)
    await userEvent.unhover(col)
    await waitFor(() => expect(screen.queryByTestId('chart-tip')).not.toBeInTheDocument())
    await userEvent.click(col)
    expect(await screen.findByTestId('where')).toHaveTextContent('/transactions?month=2026-09')
  })

  it('links an unusual month in the findings to its transactions', async () => {
    renderAt('/reports?range=3M')
    const link = await screen.findByRole('link', { name: /See October's transactions/ })
    expect(link).toHaveAttribute('href', '/transactions?month=2026-10')
  })
})

describe('Categories', () => {
  it('opens a category card on that category and month', async () => {
    renderAt('/reports?tab=categories&range=3M')
    const card = await screen.findByRole('link', { name: /Food: .* this month/ })
    expect(card).toHaveAttribute('href', '/expenses?category=7&month=2026-10')
  })
  it('opens a bubble on the category over the whole range', async () => {
    renderAt('/reports?tab=categories&range=3M')
    const bubble = await screen.findByRole('link', { name: /Food: 60% of the total/ })
    await userEvent.click(bubble)
    expect(await screen.findByTestId('where')).toHaveTextContent('/expenses?category=7&from=2026-08&to=2026-10')
  })
})

describe('Compare', () => {
  it('shows a category\'s detail with links when its table name is picked', async () => {
    renderAt('/reports?tab=compare&range=3M')
    await userEvent.click(await screen.findByRole('button', { name: 'Food' }))
    const detail = await screen.findByText(/30 purchases|20 → 30 purchases/)
    expect(detail).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^See / })).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('link', { name: /^See / })).not.toBeInTheDocument()
  })
})

describe('Budgets', () => {
  it('links a month square to that category and month', async () => {
    renderAt('/reports?tab=budgets&range=3M')
    const sq = await screen.findByRole('link', { name: /Food, Sep 2026: .* Open transactions/ })
    expect(sq).toHaveAttribute('href', '/expenses?category=7&month=2026-09')
  })
})

describe('transaction lists opened from a report', () => {
  it('filters to a run of months from from= and to=', async () => {
    render(
      <QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter initialEntries={['/expenses?category=7&from=2026-05&to=2026-07']}>
        <TransactionTable allowedTypes={['expense']} title="Expenses" description="d" />
      </MemoryRouter></ToastProvider></QueryClientProvider>,
    )
    await waitFor(() => expect(urls.some((u) => u.pathname.endsWith('/transactions'))).toBe(true))
    const list = urls.filter((u) => u.pathname.endsWith('/transactions')).pop()!
    expect(list.searchParams.get('dateFrom')).toBe('2026-05-01')
    expect(list.searchParams.get('dateTo')).toBe('2026-07-31')
    expect(list.searchParams.get('categoryId')).toBe('7')
  })
})
