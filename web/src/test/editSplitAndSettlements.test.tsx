/** Editing an expense into a split (and back), and deleting a settlement. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TransactionForm } from '@/components/domain/TransactionForm'
import { TxnDetailDrawer } from '@/components/domain/TxnDetailDrawer'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import type { Transaction, User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })

const routes: Record<string, unknown> = {
  '/accounts': [{ id: 1, name: 'HDFC Savings', accountType: 'ASSET', currencyCode: 'INR', isActive: true, subtype: 'bank', creditLimit: null, statementDay: null, balance: money(1000000), createdAt: 'x', updatedAt: 'x' }],
  '/categories': [{ id: 7, name: 'Food', accountType: 'EXPENSE', currencyCode: 'INR', parentId: null, budgetLimit: null, color: null, isActive: true, createdAt: 'x', updatedAt: 'x' }],
  '/friends': [
    { id: 11, name: 'Rahul', email: 'r@example.com', phone: null, dueAccountId: 21, createdAt: 'x' },
    { id: 12, name: 'Riya', email: 'ri@example.com', phone: null, dueAccountId: 22, createdAt: 'x' },
  ],
}

const txnDto = (over: Record<string, unknown>) => ({
  id: 5, type: 'expense', description: 'Dinner', memo: null, tags: [], date: '2026-10-10', currency: 'INR', status: 'posted',
  amount: money(10000), accountId: 1, toAccountId: null, categoryId: 7, friendId: null, direction: null, yourShare: null,
  splits: null, refundOfId: null, correctionOf: null, replacedBy: null, createdAt: 'x', updatedAt: 'x', unpaid: null, groupKey: null,
  ...over,
})

const base: Transaction = {
  id: 5, type: 'expense', description: 'Dinner', memo: null, tags: [], date: '2026-10-10', currency: 'INR', status: 'posted',
  createdAt: 'x', updatedAt: 'x', amount: 100, accountId: 1, categoryId: 7,
}

let patched: { path: string; body: Record<string, unknown> }[]
let deleted: string[]
let listed: URL[]

beforeEach(() => {
  patched = []
  deleted = []
  listed = []
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (init?.method === 'PATCH') {
      patched.push({ path, body: JSON.parse(String(init.body)) })
      return json(txnDto({}))
    }
    if (init?.method === 'DELETE') {
      deleted.push(path)
      return json({ detail: 'deleted' })
    }
    if (path === '/transactions') {
      listed.push(url)
      return json({ items: [], total: 0, limit: 12, offset: 0 })
    }
    if (path === '/transactions/groups') return json({ groupBy: 'type', groups: [] })
    return json(path in routes ? routes[path] : [])
  }))
})
afterEach(() => vi.unstubAllGlobals())

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('editing an expense into a split', () => {
  it('lets you pick friends while editing and sends the split with the same bill', async () => {
    const user = userEvent.setup()
    wrap(<TransactionForm open onOpenChange={() => {}} editingTxn={base} />)
    await user.click(await screen.findByRole('button', { name: /^Rahul/ }))           // used to do nothing in edit
    expect(screen.getByLabelText('Total bill')).toHaveValue(100)
    expect(screen.getByLabelText('You share')).toHaveValue(50)
    expect(screen.getByLabelText('Rahul share')).toHaveValue(50)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(patched).toHaveLength(1))
    expect(patched[0].path).toBe('/transactions/5')
    expect(patched[0].body).toMatchObject({ amount: '100.00', yourShare: '50.00', splits: [{ friendId: 11, share: '50.00' }] })
  })

  it('does not offer income to be split', async () => {
    wrap(<TransactionForm open onOpenChange={() => {}} editingTxn={{ ...base, type: 'income' }} />)
    await screen.findByLabelText('Description')
    expect(screen.queryByRole('region', { name: 'Split with friends' })).not.toBeInTheDocument()
  })

  it('turns a split back into a plain expense when every friend is removed', async () => {
    const user = userEvent.setup()
    const split: Transaction = { ...base, type: 'split', yourShare: 40, splits: [{ friendId: 11, share: 60 }] }
    wrap(<TransactionForm open onOpenChange={() => {}} editingTxn={split} />)
    await user.click(await screen.findByRole('button', { name: /^Rahul/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(patched).toHaveLength(1))
    expect(patched[0].body).toMatchObject({ amount: '100.00', splits: [] })
  })
})

describe('deleting a settlement', () => {
  const settlement: Transaction = { ...base, id: 9, type: 'settlement', description: 'Settlement from Rahul', friendId: 11, direction: 'receive', categoryId: undefined }

  it('offers Delete but no Edit, and explains what it undoes', async () => {
    const user = userEvent.setup()
    wrap(<TxnDetailDrawer txn={settlement} open onOpenChange={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Delete this settlement?')).toBeInTheDocument()
    expect(screen.getByText(/balance goes back to what it was/)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(deleted).toEqual(['/transactions/9']))
  })
})
