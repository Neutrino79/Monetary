/** Friend-paid ("fronted") expenses on the budget bar and the friend/shared cards. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BudgetBar } from '@/components/domain/BudgetBar'
import { SharedPage } from '@/pages/SharedPage'
import { FriendsPage } from '@/pages/FriendsPage'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import type { BudgetStatus, User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })
const budget = (over: Partial<BudgetStatus> = {}): BudgetStatus => ({
  categoryId: 7, categoryName: 'Food', budget: 5000, spent: 2000, remaining: 3000, percentageUsed: 40, overBudget: false, notPaidBack: 0, ...over,
})

const renderBar = (b: BudgetStatus, month = '2026-09') =>
  render(<MemoryRouter><BudgetBar b={b} month={month} /></MemoryRouter>)

describe('budget bar', () => {
  it('says how much is left, the percentage, and links to that month\'s expenses', () => {
    renderBar(budget())
    expect(screen.getByText(/₹3,000 left/)).toBeInTheDocument()
    expect(screen.getByText(/₹2,000 of ₹5,000 · 40%/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Food expenses/ })).toHaveAttribute('href', '/expenses?category=7&month=2026-09')
  })

  it('says how much it is over when the budget is exceeded', () => {
    renderBar(budget({ spent: 5600, percentageUsed: 112, overBudget: true }))
    expect(screen.getByText(/₹600 over/, { selector: 'span.ledger-figure' })).toBeInTheDocument()
  })

  it('shows no marker when everything is paid back', () => {
    renderBar(budget())
    expect(screen.queryByTestId('not-paid-back-slice')).not.toBeInTheDocument()
    expect(screen.queryByText(/not paid back yet/)).not.toBeInTheDocument()
  })

  it('marks the fronted spend that is not paid back yet', () => {
    renderBar(budget({ notPaidBack: 1240 }))
    expect(screen.getByTestId('not-paid-back-slice')).toBeInTheDocument()
    expect(screen.getByText(/of this is not paid back yet/)).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/not paid back yet/)
  })
})

describe('friend cards', () => {
  beforeEach(() => {
    localStorage.setItem('emx_token', 'ets_test')
    queryClient.clear()
    useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
    const routes: Record<string, unknown> = {
      '/friends': [{ id: 11, name: 'Rahul', email: 'r@example.com', phone: null, dueAccountId: 21, createdAt: 'x' }],
      '/friends/balances': [{ friendId: 11, friendName: 'Rahul', balance: money(-124000), frontedUnpaid: money(124000) }],
      '/accounts': [{ id: 1, name: 'HDFC Savings', accountType: 'ASSET', currencyCode: 'INR', isActive: true, subtype: 'bank', creditLimit: null, statementDay: null, balance: money(1000000), createdAt: 'x', updatedAt: 'x' }],
      '/transactions': { items: [], total: 0, limit: 12, offset: 0 },
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v0\.5/, '')
      return new Response(JSON.stringify(path in routes ? routes[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const wrap = (ui: React.ReactElement) =>
    render(<QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter>{ui}</MemoryRouter></ToastProvider></QueryClientProvider>)

  it('shows what a friend paid for you that is not paid back, with a Pay back button that opens prefilled', async () => {
    const user = userEvent.setup()
    wrap(<FriendsPage />)
    expect(await screen.findByText(/Paid for you, not paid back/)).toHaveTextContent('1,240')
    await user.click(screen.getByRole('button', { name: /Pay back/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: /Amount/ })).toHaveValue('1240')              // the amount owed is prefilled
    expect(within(dialog).getByRole('combobox', { name: /Pay from account/ })).toHaveTextContent('HDFC Savings')   // first account chosen
  })

  it('has the "Paid by" filter on the Shared page and the same pending marker', async () => {
    const user = userEvent.setup()
    wrap(<SharedPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Shared' })).toBeInTheDocument()
    expect(await screen.findByText(/Paid for you, not paid back/)).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Paid by' })
    expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(group).getByRole('button', { name: 'Friend paid' }))
    expect(within(group).getByRole('button', { name: 'Friend paid' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Add friend-paid expense/ })).toBeInTheDocument()
  })
})
