/** The Categories page: the total budget bar, editing limits with a live total, saving, and the pure plan arithmetic. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { BUDGET_STEP, budgetAdvice, nextLimit, planSummary, shareOf, startingLimit } from '@/lib/utils/budgetPlan'

describe('plan arithmetic', () => {
  const items = [
    { id: 1, spent: 21400, saved: 24000, limit: 24000 },
    { id: 2, spent: 7900, saved: 6000, limit: 6000 },
    { id: 3, spent: 4100, saved: null, limit: null },
  ]
  it('totals limits, spend, real room and unbudgeted spend', () => {
    const s = planSummary(items)
    expect(s.total).toBe(30000)
    expect(s.spent).toBe(29300)
    expect(s.left).toBe(2600)            // Shopping is over its limit, which frees nothing for Food
    expect(s.unbudgeted).toBe(4100)
    expect(s.delta).toBe(0)
  })
  it('shows what saving would change', () => {
    const s = planSummary([{ id: 1, spent: 0, saved: 24000, limit: 24500 }, { id: 3, spent: 0, saved: null, limit: 1000 }])
    expect(s.total).toBe(25500)
    expect(s.delta).toBe(1500)
  })
  it('steps a limit and never goes below one step', () => {
    expect(nextLimit(24000, 1, 500)).toBe(24500)
    expect(nextLimit(24000, -1, 500)).toBe(23500)
    expect(nextLimit(BUDGET_STEP, -1, 500)).toBe(BUDGET_STEP)
    expect(nextLimit(null, 1, 3000)).toBe(3000)
    expect(nextLimit(null, -1, 3000)).toBeNull()
  })
  it('suggests a tidy first limit', () => {
    expect(startingLimit(4100)).toBe(4500)
    expect(startingLimit(0)).toBe(500)
    expect(startingLimit(4100, 6000)).toBe(6000)
  })
  it('rounds a share of the plan', () => {
    expect(shareOf(24000, 65000)).toBe(37)
    expect(shareOf(1, 0)).toBe(0)
  })
  it('words the advice for each case', () => {
    const row = (over: number, action: 'raise' | 'tighten' | 'keep', limit = 6000) => ({ categoryId: 1, name: 'X', color: null, limit: 5000, points: [], monthsOver: over, held: 6 - over, completeMonths: 6, typicalPct: 88, suggestion: { action, limit, recentOvershoot: 0 } })
    expect(budgetAdvice({ limit: 5000, saved: 5000, history: row(4, 'raise'), average: 0 })).toContain('Over budget in 4 of the last 6 months')
    expect(budgetAdvice({ limit: 5000, saved: 5000, history: row(0, 'tighten', 4000), average: 0 })).toContain('free up')
    expect(budgetAdvice({ limit: 5000, saved: 5000, history: row(1, 'keep'), average: 0 })).toContain('this limit fits')
    expect(budgetAdvice({ limit: 5500, saved: 5000, history: row(1, 'keep'), average: 0 })).toContain('Changed from')
    expect(budgetAdvice({ limit: null, saved: null, average: 900 })).toContain('No budget yet')
  })
})

const money = (major: number) => ({ points: Math.round(major * 100), major: `INR ${major.toFixed(2)}`, currency: 'INR' })
const cat = (id: number, name: string, budget: number | null, parentId: number | null = null) => ({
  id, name, accountType: 'EXPENSE', currencyCode: 'INR', parentId, budgetLimit: budget == null ? null : money(budget), color: '#3E7C6E', isActive: true, createdAt: 'x', updatedAt: 'x',
})
const total = (categoryId: number, categoryName: string, v: number, children: { categoryId: number; categoryName: string; total: ReturnType<typeof money> }[] = []) => ({ categoryId, categoryName, total: money(v), children })

let patches: { path: string; body: unknown }[]
beforeEach(() => {
  patches = []
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: { id: 1, name: 'A', email: 'a@x.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR', ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x' }, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (init?.method === 'PATCH') {
      patches.push({ path, body: JSON.parse(String(init.body)) })
      return json(cat(1, 'Food', 24500))
    }
    const bodies: Record<string, unknown> = {
      '/categories': [cat(1, 'Food', 24000), cat(2, 'Shopping', 6000), cat(3, 'Gifts', null), cat(4, 'Groceries', null, 1)],
      '/reports/spending': [total(1, 'Food', 21400, [{ categoryId: 4, categoryName: 'Groceries', total: money(12900) }]), total(2, 'Shopping', 7900), total(3, 'Gifts', 4100)],
      '/reports/categories': { currency: 'INR', kind: 'spending', months: 6, seriesMonths: [5, 6, 7, 8, 9, 10].map((m) => ({ year: 2026, month: m })), categories: [], total: { average: money(0), previousAverage: money(0), changePct: null } },
      '/reports/budget-history': { currency: 'INR', months: 6, budgets: [], limitTotal: money(30000), monthTotals: [], unbudgeted: [], held: 0, budgetMonths: 0, coveragePct: null },
      '/transactions': { items: [], total: 0, limit: 20, offset: 0 },
      '/tags': [],
    }
    return json(path in bodies ? bodies[path] : [])
  }))
})
afterEach(() => vi.unstubAllGlobals())

function renderPage(url = '/categories') {
  return render(<QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter initialEntries={[url]}><CategoriesPage /></MemoryRouter></ToastProvider></QueryClientProvider>)
}

describe('Categories page', () => {
  it('shows the total budget with spent, room left and spending with no budget', async () => {
    renderPage()
    expect(await screen.findByTestId('plan-total')).toHaveTextContent('30,000')
    const bar = screen.getByRole('region', { name: 'Total monthly budget' })
    expect(within(bar).getByText('No budget')).toBeInTheDocument()
    expect(within(bar).getByText('Spending with no budget').nextSibling).toHaveTextContent('4,100')
  })

  it('opens on the biggest spender and switches category from the bar', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Food' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Shopping: budget/ }))
    expect(screen.getByRole('heading', { name: 'Shopping' })).toBeInTheDocument()
  })

  it('moves the total as a limit changes, then saves only what changed', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Food' })
    await user.click(screen.getByRole('button', { name: 'Raise budget by 500' }))
    expect(screen.getByTestId('plan-total')).toHaveTextContent('30,500')
    expect(screen.getByText(/\+.*500 unsaved/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save budgets' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toEqual({ path: '/categories/1', body: { budgetLimit: '24500.00' } })
    await waitFor(() => expect(screen.queryByText(/unsaved/)).not.toBeInTheDocument())
  })

  it('undo puts every limit back', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Food' })
    await user.click(screen.getByRole('button', { name: 'Lower budget by 500' }))
    expect(screen.getByTestId('plan-total')).toHaveTextContent('29,500')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByTestId('plan-total')).toHaveTextContent('30,000')
    expect(patches).toHaveLength(0)
  })

  it('adds a budget to a category that has none, and the total grows', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Food' })
    await user.click(screen.getByRole('button', { name: /^Gifts/ }))
    await user.click(screen.getByRole('button', { name: /Set a limit/ }))
    expect(screen.getByTestId('plan-total')).toHaveTextContent('34,500')   // Gifts spent 4,100 -> starts at 4,500
  })

  it('has Tags and Income tabs', async () => {
    const user = userEvent.setup()
    renderPage('/categories?tab=income')
    expect(await screen.findByRole('button', { name: /Add income source/ })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Tags' }))
    expect(await screen.findByLabelText('New tag')).toBeInTheDocument()
  })
})
