/** The dashboard: the strip, the spending-pace chart (hover, tap, click-through, past months), and its empty states. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import { TransactionTable } from '@/components/domain/TransactionTable'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { toISODate } from '@/lib/utils/clock'
import { shiftMonth } from '@/lib/utils/dateRange'
import type { User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (major: number) => ({ points: Math.round(major * 100), major: `INR ${major.toFixed(2)}`, currency: 'INR' })

const monthKey = toISODate(new Date()).slice(0, 7)
const daysIn = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate()

interface Scenario { budget: number | null; income: number; expense: number; transactions: number; cashflow: boolean; projection: boolean }
let scenario: Scenario
let urls: URL[]

function paceBody(key: string) {
  const current = key === monthKey
  const n = daysIn(key)
  const elapsed = current ? Math.min(10, n) : n
  const prev = shiftMonth(key, -1)
  return {
    currency: 'INR', year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), daysInMonth: n, elapsedDays: elapsed, isCurrentMonth: current,
    days: Array.from({ length: elapsed }, (_, i) => scenario.expense === 0 ? { day: i + 1, spent: money(0), cumulative: money(0) } : { day: i + 1, spent: money(1000), cumulative: money(1000 * (i + 1)) }),
    previous: { year: Number(prev.slice(0, 4)), month: Number(prev.slice(5, 7)), cumulative: Array.from({ length: daysIn(prev) }, (_, i) => money(800 * (i + 1))) },
    budgetTotal: scenario.budget === null ? null : money(scenario.budget),
    projection: current && scenario.projection ? {
      method: 'history', basisMonths: 3, expected: money(46000), low: money(44000), high: money(49000),
      days: Array.from({ length: n - elapsed }, (_, i) => ({ day: elapsed + i + 1, expected: money(46000), low: money(44000), high: money(49000) })),
    } : null,
  }
}

beforeEach(() => {
  urls = []
  scenario = { budget: 52000, income: 62370, expense: 38420, transactions: 3, cashflow: true, projection: true }
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    urls.push(url)
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    const key = url.searchParams.get('month') ?? monthKey
    const txn = (id: number) => ({
      id, type: 'expense', description: `Item ${id}`, memo: null, date: `${monthKey}-02`, currency: 'INR', status: 'posted', amount: money(100),
      accountId: null, toAccountId: null, categoryId: null, friendId: null, direction: null, yourShare: null, splits: null,
      refundOfId: null, correctionOf: null, replacedBy: null, createdAt: 'x', updatedAt: 'x', tags: [],
    })
    const bodies: Record<string, unknown> = {
      '/reports/dashboard': {
        year: 2026, month: 10, netWorth: [], budgetStatus: scenario.budget === null ? [] : [
          { categoryId: 7, categoryName: 'Food', budget: money(12000), spent: money(9000), remaining: money(3000), percentageUsed: 75, overBudget: false, notPaidBack: money(0) },
        ],
        summary: [{ currency: 'INR', income: money(scenario.income), expense: money(scenario.expense), savings: money(scenario.income - scenario.expense) }],
        topSpending: [], incomeSummary: [], friendBalances: [], friendTotals: [],
      },
      '/reports/spending-pace': paceBody(key),
      '/reports/spending': scenario.expense === 0 ? [] : [
        { categoryId: 7, categoryName: 'Food', total: money(9000), children: [] },
        { categoryId: 8, categoryName: 'Rent', total: money(14500), children: [] },
      ],
      '/reports/trends/cashflow': { currency: 'INR', points: scenario.cashflow
        ? [{ year: 2026, month: 9, income: money(59000), expense: money(42000), net: money(17000) }, { year: 2026, month: 10, income: money(62370), expense: money(38420), net: money(23950) }]
        : [{ year: 2026, month: 10, income: money(0), expense: money(0), net: money(0) }] },
      '/transactions': { items: Array.from({ length: scenario.transactions }, (_, i) => txn(i + 1)), total: scenario.transactions, limit: 6, offset: 0 },
    }
    return new Response(JSON.stringify(path in bodies ? bodies[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.pathname + l.search}</div>
}
function renderDashboard() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
const headline = () => screen.findByTestId('pace-headline')

describe('dashboard summary', () => {
  it('shows income, spent and saved in one strip with the savings rate under it', async () => {
    renderDashboard()
    const strip = await screen.findByRole('region', { name: 'This month' })
    expect(within(strip).getByText('Income')).toBeInTheDocument()
    expect(within(strip).getByText('Spent')).toBeInTheDocument()
    expect(within(strip).getByText('Saved')).toBeInTheDocument()
    expect(await screen.findByTestId('savings-line')).toHaveTextContent('saved, 38% of income')
    expect(screen.queryByText('Net worth')).not.toBeInTheDocument()
  })

  it('says so when you spent more than came in', async () => {
    scenario.income = 10000
    renderDashboard()
    expect(await screen.findByTestId('savings-line')).toHaveTextContent(/more than came in/)
    expect(screen.getByText('Overspent')).toBeInTheDocument()
  })
})

describe('spending pace', () => {
  it('headlines where the month should end against the budget, from the same numbers as the chart', async () => {
    renderDashboard()
    expect(await headline()).toHaveTextContent('On pace to spend about ₹46,000, ₹6,000 under your ₹52,000 budget')
    expect(screen.getByText('Expected')).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
  })

  it('shows the numbers for a day on hover and opens that day on click', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await headline()
    const day = screen.getByTestId('pace-day-4')
    await user.hover(day)
    const tip = await screen.findByTestId('pace-tooltip')
    expect(tip).toHaveTextContent('Spent so far ₹4,000')
    expect(tip).toHaveTextContent('That day ₹1,000')
    await user.click(day)
    expect(await screen.findByTestId('where')).toHaveTextContent(`/transactions?date=${monthKey}-04`)
  })

  it('on a phone the first tap inspects a day and the second opens it', async () => {
    renderDashboard()
    await headline()
    const day = screen.getByTestId('pace-day-4')
    fireEvent.pointerDown(day, { pointerType: 'touch' })
    fireEvent.click(day)
    const tip = await screen.findByTestId('pace-tooltip')
    expect(tip).toHaveTextContent('Tap again to see that day')
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
    fireEvent.pointerDown(day, { pointerType: 'touch' })
    fireEvent.click(day)
    expect(await screen.findByTestId('where')).toHaveTextContent(`/transactions?date=${monthKey}-04`)
  })

  it('moves between days with the arrow keys', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await headline()
    const chart = screen.getByRole('group', { name: /Cumulative spending by day/ })
    chart.focus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(await screen.findByTestId('pace-tooltip')).toHaveTextContent('Spent so far ₹8,000')
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('pace-tooltip')).not.toBeInTheDocument()
  })

  it('a past month is the final line: no projection, no expected key', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await headline()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(screen.getByTestId('pace-headline')).toHaveTextContent(/^You spent /))
    expect(screen.getByTestId('pace-headline')).toHaveTextContent(/under budget|over budget/)
    expect(screen.queryByText('Expected')).not.toBeInTheDocument()
    expect(screen.queryByText('Safe per day')).not.toBeInTheDocument()
  })

  it('without a budget it asks for one, in one line, and still draws the chart', async () => {
    scenario.budget = null
    renderDashboard()
    expect(await headline()).toHaveTextContent('On pace to spend about ₹46,000 this month')
    expect(screen.getByText(/Set a budget to see how you're pacing/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add budgets' })).toHaveAttribute('href', '/categories')
    expect(screen.queryByText('Left in budget')).not.toBeInTheDocument()   // facts that need a budget are left out, not blank
  })

  it('with too little history it says "so far" rather than guessing', async () => {
    scenario.projection = false
    renderDashboard()
    expect(await headline()).toHaveTextContent(/spent so far, of your ₹52,000 budget/)
    expect(screen.queryByText('Expected')).not.toBeInTheDocument()
  })
})

describe('click-through', () => {
  it('opens the category and month from a donut slice, its name and a spending row', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await headline()
    const links = screen.getAllByRole('link', { name: /Food/ }).map((a) => a.getAttribute('href'))
    expect(links.every((h) => h === `/expenses?category=7&month=${monthKey}`)).toBe(true)
    expect(links.length).toBeGreaterThanOrEqual(2)       // the legend and the budget row
    await user.click(screen.getByTestId('donut-slice-Food'))
    expect(await screen.findByTestId('where')).toHaveTextContent(`/expenses?category=7&month=${monthKey}`)
  })

  it('shows a slice\'s amount in the middle on hover', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await headline()
    await user.hover(screen.getByTestId('donut-slice-Rent'))
    expect(screen.getByTestId('donut-centre')).toHaveTextContent('₹14,500')
    expect(screen.getByTestId('donut-centre')).toHaveTextContent('Rent')
  })

  it('opens a month\'s transactions from the six-month bars, after a first tap on a phone', async () => {
    renderDashboard()
    await headline()
    const bar = await screen.findByRole('link', { name: /Sep 2026|Sept 2026|September 2026/ })
    fireEvent.pointerDown(bar, { pointerType: 'touch' })
    fireEvent.click(bar)
    expect(await screen.findByTestId('bars-tooltip')).toHaveTextContent('Tap again to open')
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
    fireEvent.pointerDown(bar, { pointerType: 'touch' })
    fireEvent.click(bar)
    expect(await screen.findByTestId('where')).toHaveTextContent('/transactions?month=2026-09')
  })
})

describe('empty and first-time states', () => {
  it('a brand-new ledger gets one welcome card instead of empty charts', async () => {
    scenario = { budget: null, income: 0, expense: 0, transactions: 0, cashflow: false, projection: false }
    renderDashboard()
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your first transaction/ })).toBeInTheDocument()
    expect(screen.queryByText('Spending pace')).not.toBeInTheDocument()
  })

  it('cards with nothing to show collapse instead of showing blanks', async () => {
    scenario.cashflow = false
    scenario.expense = 0
    scenario.transactions = 0
    scenario.income = 5000
    renderDashboard()
    expect(await screen.findByText(/Nothing spent in .* yet\./)).toBeInTheDocument()
    expect(screen.queryByText('Last six months')).not.toBeInTheDocument()
    expect(screen.queryByText('Where it went')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument()
  })
})

describe('transactions opened for one day', () => {
  it('?date= filters the list to that day', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/transactions?date=2026-10-17']}>
            <TransactionTable allowedTypes={['expense']} title="Transactions" description="d" />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(urls.some((u) => u.pathname.endsWith('/transactions'))).toBe(true))
    const list = urls.filter((u) => u.pathname.endsWith('/transactions')).pop()!
    expect(list.searchParams.get('dateFrom')).toBe('2026-10-17')
    expect(list.searchParams.get('dateTo')).toBe('2026-10-17')
  })
})
