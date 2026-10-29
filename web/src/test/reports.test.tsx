/** The Reports & Trends page: range handling, the tabs, and applying a budget suggestion. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ReportsPage } from '@/pages/ReportsPage'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { comparePeriods, parseRange, rangeMonths, spanIsValid, spanLabel } from '@/lib/utils/reportRange'
import { findingText, signedMoney, signedPct } from '@/lib/utils/reportText'
import { scenarioLine } from '@/lib/utils/outlookScenario'
import type { User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (major: number) => ({ points: Math.round(major * 100), major: `INR ${major.toFixed(2)}`, currency: 'INR' })

describe('range helpers', () => {
  const oct = new Date(2026, 9, 15)
  it('maps each range to a number of months, year to date counting the current month', () => {
    expect(rangeMonths('3M', oct)).toBe(3)
    expect(rangeMonths('12M', oct)).toBe(12)
    expect(rangeMonths('YTD', oct)).toBe(10)
    expect(rangeMonths('YTD', new Date(2026, 0, 3))).toBe(1)
  })
  it('falls back to 12M for anything unknown', () => {
    expect(parseRange('6M')).toBe('6M')
    expect(parseRange('banana')).toBe('12M')
    expect(parseRange(null)).toBe('12M')
  })
  it('builds the previous period and the same period last year', () => {
    expect(comparePeriods('3M', 'previous', oct)).toEqual({ a: { from: '2026-08', to: '2026-10' }, b: { from: '2026-05', to: '2026-07' } })
    expect(comparePeriods('3M', 'year', oct)).toEqual({ a: { from: '2026-08', to: '2026-10' }, b: { from: '2025-08', to: '2025-10' } })
    // year to date has no sensible "months just before", so it always means last year
    expect(comparePeriods('YTD', 'previous', oct).b).toEqual({ from: '2025-01', to: '2025-10' })
  })
  it('labels and validates spans', () => {
    expect(spanLabel({ from: '2026-08', to: '2026-10' })).toBe('Aug – Oct 2026')
    expect(spanLabel({ from: '2025-11', to: '2026-10' })).toBe('Nov 2025 – Oct 2026')
    expect(spanLabel({ from: '2026-10', to: '2026-10' })).toBe('Oct 2026')
    expect(spanIsValid({ from: '2026-10', to: '2026-08' })).toBe(false)
    expect(spanIsValid({ from: '2023-01', to: '2026-10' })).toBe(false)
    expect(spanIsValid({ from: '', to: '2026-10' })).toBe(false)
  })
})

describe('wording', () => {
  it('formats signed amounts and percentages', () => {
    expect(signedPct(27.4)).toBe('+27%')
    expect(signedPct(-4)).toBe('−4%')
    expect(signedPct(null)).toBe('—')
    expect(signedMoney(0)).toBe('—')
    expect(signedMoney(-680)).toContain('−')
  })
  it('words a savings-rate finding with the trend', () => {
    const t = findingText({ code: 'savings_rate', tone: 'good', rate: 38, previousRate: 31, goodMonths: 4, completeMonths: 5 })
    expect(t.title).toBe('You keep 38% of your income, up from 31%.')
    expect(t.body).toBe('4 of the last 5 complete months were at or above 30%.')
  })
  it('words an unusual month', () => {
    const t = findingText({ code: 'unusual_months', tone: 'watch', flagged: [{ year: 2026, month: 8, pct: 42 }] })
    expect(t.title).toBe('August was the one unusual month.')
    expect(t.body).toContain('42% above')
  })
})

describe('what-if scenario', () => {
  const fc = [1, 2, 3].map((i) => ({ year: 2026, month: 10 + i, expected: 1000 * i, low: 0, high: 0 }))
  const levers = [{ categoryId: 1, name: 'Dining', limit: 100, typical: 150, monthlySaving: 50 }, { categoryId: 2, name: 'Cabs', limit: 100, typical: 120, monthlySaving: 20 }]
  it('adds the monthly saving cumulatively for the chosen levers only', () => {
    expect(scenarioLine(fc, levers, new Set([1]))).toEqual([1050, 2100, 3150])
    expect(scenarioLine(fc, levers, new Set([1, 2]))).toEqual([1070, 2140, 3210])
    expect(scenarioLine(fc, levers, new Set())).toEqual([1000, 2000, 3000])
  })
})

let patches: { url: string; body: unknown }[]
beforeEach(() => {
  patches = []
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
    if (init?.method === 'PATCH') {
      patches.push({ url: path, body: JSON.parse(String(init.body)) })
      return json({ id: 7, name: 'Dining', accountType: 'EXPENSE', currencyCode: 'INR', parentId: null, budgetLimit: money(6000), color: null, isActive: true, createdAt: 'x', updatedAt: 'x' })
    }
    if (path === '/reports/budget-history') {
      return json({
        currency: 'INR', months: 3,
        budgets: [{ categoryId: 7, name: 'Dining', color: null, limit: money(5000), points: [money(5200), money(5600), money(4800)], monthsOver: 2, held: 1, completeMonths: 3, typicalPct: 104, suggestion: { action: 'raise', limit: money(6000), recentOvershoot: money(600) } }],
        limitTotal: money(5000), monthTotals: [{ year: 2026, month: 8, isPartial: false, spent: money(5200) }, { year: 2026, month: 9, isPartial: false, spent: money(5600) }, { year: 2026, month: 10, isPartial: true, spent: money(4800) }],
        unbudgeted: [{ categoryId: 9, name: 'Gifts', color: null, average: money(900), peak: money(4000), suggestion: { period: 'year', limit: money(12000) } }],
        held: 1, budgetMonths: 3, coveragePct: 82,
      })
    }
    if (path === '/reports/outlook') {
      return json({ currency: 'INR', months: 12, learnedFrom: 2, netWorthNow: money(1000), history: [], method: 'none', forecast: [], yearEnd: null, typicalMonthlyKept: money(0), levers: [] })
    }
    return json({})
  }))
})
afterEach(() => vi.unstubAllGlobals())

function renderPage(url: string) {
  return render(
    <QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter initialEntries={[url]}><ReportsPage /></MemoryRouter></ToastProvider></QueryClientProvider>,
  )
}

describe('ReportsPage', () => {
  it('shows the five tabs and one range picker, defaulting to 12M', () => {
    renderPage('/reports')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview', 'Categories', 'Compare', 'Budgets', 'Outlook'])
    expect(screen.getByRole('radio', { name: '12M' })).toBeChecked()
  })

  it('follows the range in the URL and changes it on click', async () => {
    renderPage('/reports?range=6M')
    expect(screen.getByRole('radio', { name: '6M' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: '3M' }))
    expect(screen.getByRole('radio', { name: '3M' })).toBeChecked()
  })

  it('applies a suggested budget limit from the Budgets tab', async () => {
    renderPage('/reports?tab=budgets&range=3M')
    expect(await screen.findByText('Budget by budget')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Apply .*6,000.* to Dining/ }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toEqual({ url: '/categories/7', body: { budgetLimit: '6000.00' } })
  })

  it('spreads a yearly suggestion over twelve months when setting a limit', async () => {
    renderPage('/reports?tab=budgets')
    await userEvent.click(await screen.findByRole('button', { name: /Set Gifts budget to .*1,000.* a month/ }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]!.body).toEqual({ budgetLimit: '1000.00' })
  })

  it('says so when there is too little history to look ahead', async () => {
    renderPage('/reports?tab=outlook')
    expect(await screen.findByText('Not enough history to look ahead')).toBeInTheDocument()
  })
})
