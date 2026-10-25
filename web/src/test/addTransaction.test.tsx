/** The Add Transaction modal: "Paid by You / a friend" and "Split with" decide which kind of entry is created. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TransactionForm } from '@/components/domain/TransactionForm'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import type { User } from '@/types'
import { selectValue } from './helpers'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })

const routes: Record<string, unknown> = {
  '/accounts': [{ id: 1, name: 'HDFC Savings', accountType: 'ASSET', currencyCode: 'INR', isActive: true, subtype: 'bank', creditLimit: null, statementDay: null, balance: money(1000000), createdAt: 'x', updatedAt: 'x' }],
  '/categories': [{ id: 7, name: 'Food', accountType: 'EXPENSE', currencyCode: 'INR', parentId: null, budgetLimit: money(500000), color: null, isActive: true, createdAt: 'x', updatedAt: 'x' }],
  '/friends': [
    { id: 11, name: 'Rahul', email: 'r@example.com', phone: null, dueAccountId: 21, createdAt: 'x' },
    { id: 12, name: 'Riya', email: 'ri@example.com', phone: null, dueAccountId: 22, createdAt: 'x' },
  ],
  '/tags': [{ id: 1, name: 'work', uses: 4 }, { id: 2, name: 'goa trip', uses: 2 }],
  '/reports/dashboard': {
    year: 2026, month: 10, netWorth: [], summary: [], accountBalances: [], budgetStatus: [{
      categoryId: 7, categoryName: 'Food', budget: money(500000), spent: money(250000), remaining: money(250000),
      percentageUsed: 50, overBudget: false, notPaidBack: money(0),
    }], topSpending: [], incomeSummary: [], friendBalances: [], friendTotals: [],
  },
}

let posted: Record<string, unknown>[]
beforeEach(() => {
  posted = []
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    if (init?.method === 'POST' && path === '/transactions') {
      const body = JSON.parse(String(init.body))
      posted.push(body)
      return new Response(JSON.stringify({
        id: 99, ...body, memo: null, currency: 'INR', status: 'posted', amount: money(100), accountId: null, toAccountId: null,
        categoryId: null, friendId: null, direction: null, yourShare: null, splits: null, refundOfId: null, correctionOf: null,
        replacedBy: null, createdAt: 'x', updatedAt: 'x', unpaid: null, groupKey: null,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(path in routes ? routes[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function renderForm() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <TransactionForm open onOpenChange={() => {}} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await user.type(await screen.findByLabelText('Description'), 'Dinner at Truffles')
  await user.type(screen.getByLabelText(/^(Amount|Total bill|Your share)$/), amount)
  await selectValue(user, screen.getByLabelText('Category'), '7')
}

describe('add transaction form', () => {
  it('records a plain expense paid from one of your accounts', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillBasics(user, '250')
    await selectValue(user, screen.getByLabelText('Pay from'), '1')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ type: 'expense', amount: '250.00', accountId: 1, categoryId: 7 })
  })

  it('sends the tags picked from the dropdown', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillBasics(user, '250')
    await selectValue(user, screen.getByLabelText('Pay from'), '1')
    await user.click(screen.getByRole('button', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'work' }))
    await user.click(screen.getByRole('option', { name: 'goa trip' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ type: 'expense', tags: ['work', 'goa trip'] })
  })

  it('records an expense a friend paid as a fronted entry with no account', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(await screen.findByRole('button', { name: 'A friend' }))
    expect(screen.queryByLabelText('Pay from')).not.toBeInTheDocument()          // none of your accounts is involved
    expect(screen.getByLabelText('Your share')).toBeInTheDocument()               // the amount is your share
    await fillBasics(user, '1240')
    await selectValue(user, screen.getByLabelText('Friend who paid'), '11')
    expect(screen.getByText(/You owe Rahul/)).toBeInTheDocument()                 // the preview says what happens
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ type: 'fronted', amount: '1240.00', friendId: 11, categoryId: 7 })
    expect(posted[0]).not.toHaveProperty('accountId')
    expect(posted[0]).not.toHaveProperty('splits')
  })

  it('asks who paid before saving a friend-paid expense', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(await screen.findByRole('button', { name: 'A friend' }))
    await fillBasics(user, '100')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(await screen.findByText('Pick the friend who paid.')).toBeInTheDocument()
    expect(posted).toHaveLength(0)
  })

  it('splits equally to the cent when you pick friends, and sends a split', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillBasics(user, '100')
    await user.click(await screen.findByRole('button', { name: /^Rahul/ }))
    await user.click(screen.getByRole('button', { name: /^Riya/ }))
    expect(screen.getByLabelText('Total bill')).toBeInTheDocument()
    expect(screen.getByLabelText('You share')).toHaveValue('33.34')                 // the odd cent goes to you
    expect(screen.getByLabelText('Rahul share')).toHaveValue('33.33')
    expect(screen.getByText(/Shares add up to/)).toBeInTheDocument()
    await selectValue(user, screen.getByLabelText('Pay from'), '1')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({
      type: 'split', amount: '100.00', yourShare: '33.34', accountId: 1,
      splits: [{ friendId: 11, share: '33.33' }, { friendId: 12, share: '33.33' }],
    })
  })

  it('previews the budget impact of the share that counts as your spending', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillBasics(user, '1000')
    expect(await screen.findByText('Food budget')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()                           // from the server's current month
    expect(screen.getByText('70%')).toBeInTheDocument()                           // (2500 + 1000) / 5000
  })
})

describe('add transaction form validation', () => {
  it('shows what is missing on submit, and each message goes away as its field is fixed', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    expect(await screen.findByText('Description is required.')).toBeInTheDocument()
    expect(screen.getByText(/Enter an amount above 0/)).toBeInTheDocument()
    expect(screen.getByText('Select a category.')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true')

    await user.type(screen.getByLabelText('Description'), 'Lunch')
    expect(screen.queryByText('Description is required.')).not.toBeInTheDocument()
    expect(screen.getByText(/Enter an amount above 0/)).toBeInTheDocument() // untouched fields keep theirs

    await user.type(screen.getByLabelText('Amount'), '120')
    await selectValue(user, screen.getByLabelText('Category'), '7')
    expect(screen.queryByText(/Enter an amount above 0/)).not.toBeInTheDocument()
    expect(screen.queryByText('Select a category.')).not.toBeInTheDocument()
    expect(screen.getByText('Select an account.')).toBeInTheDocument()
  })

  it('does not carry one tab\'s errors over to a tab that has not been submitted', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(await screen.findByRole('tab', { name: 'Income' }))
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(await screen.findByText('Select an income source.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Expense' }))
    expect(screen.queryByText('Description is required.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Enter an amount above 0/)).not.toBeInTheDocument()
    expect(screen.queryByText('Select a category.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Description')).not.toHaveAttribute('aria-invalid')
  })
})
