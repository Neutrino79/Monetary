/** Settling by bill: the settle form, the match wizard, linking old payments, and the delete-with-payments prompt. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SettleForm } from '@/components/domain/SettleForm'
import { MatchWizard } from '@/components/domain/MatchWizard'
import { LinkPaymentsDialog } from '@/components/domain/LinkPaymentsDialog'
import { TxnDetailDrawer } from '@/components/domain/TxnDetailDrawer'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import type { Friend, Transaction, User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const rahul: Friend = { id: 11, name: 'Rahul', email: 'r@example.com', phone: null, dueAccountId: 21, createdAt: 'x', color: '#888' } as unknown as Friend
const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })
const bill = (entryId: number, description: string, date: string, direction: string, amount: number, remaining = amount) => ({
  entryId, friendId: 11, type: direction === 'they_owe_you' ? 'split' : 'fronted', direction, description, date, currency: 'INR', categoryId: 7,
  amount: money(amount), paid: money(amount - remaining), matched: money(0), remaining: money(remaining), status: remaining === amount ? 'unpaid' : 'partial',
})
const txnDto = (over: Record<string, unknown>) => ({
  id: 5, type: 'settlement', description: 'Settlement', memo: null, tags: [], date: '2026-10-10', currency: 'INR', status: 'posted',
  amount: money(10000), accountId: 1, toAccountId: null, categoryId: null, friendId: 11, direction: 'receive', yourShare: null,
  splits: null, refundOfId: null, correctionOf: null, replacedBy: null, createdAt: 'x', updatedAt: 'x', unpaid: null, groupKey: null, ...over,
})

let calls: { method: string; path: string; body?: Record<string, unknown> }[]
let bills: unknown[]
let unassigned: unknown[]
let matches: unknown[]
let deleteFails: boolean

beforeEach(() => {
  calls = []
  bills = [bill(31, 'Dinner', '2026-09-01', 'they_owe_you', 30000), bill(32, 'Movie', '2026-09-10', 'they_owe_you', 20000), bill(33, 'Taxi', '2026-09-12', 'you_owe_them', 10000)]
  unassigned = []
  matches = []
  deleteFails = false
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (method !== 'GET') calls.push({ method, path, body })
    if (method === 'DELETE' && deleteFails && !url.searchParams.get('removeLinked')) {
      return json({ detail: 'Payments rest on this bill: INR 100.00 on 2026-10-10.', error_type: 'BillDependencyError', details: { payments: [] } }, 409)
    }
    if (method === 'POST' && path === '/settlements') return json({ paymentGroup: 'g1', transactions: [txnDto({})] }, 201)
    if (method === 'POST' && path === '/matches') return json({ id: 1, friendId: 11, amount: money(1000), owedToMe: { entryId: 31, description: 'Dinner', date: 'x' }, owedByMe: { entryId: 33, description: 'Taxi', date: 'x' }, locked: false, createdAt: 'x', updatedAt: 'x' }, 201)
    if (method === 'POST' && path.endsWith('/assign')) return json({ paymentGroup: 'g2', transactions: [txnDto({})] })
    if (method !== 'GET') return json({ detail: 'ok' })
    const routes: Record<string, unknown> = {
      '/accounts': [{ id: 1, name: 'HDFC Savings', accountType: 'ASSET', currencyCode: 'INR', isActive: true, subtype: 'bank', creditLimit: null, statementDay: null, balance: money(1000000), createdAt: 'x', updatedAt: 'x' }],
      '/categories': [], '/friends': [rahul], '/friends/balances': [],
      '/friends/11/bills': bills, '/friends/11/matches': matches, '/friends/11/unassigned-payments': unassigned,
    }
    return json(path in routes ? routes[path] : [])
  }))
})
afterEach(() => vi.unstubAllGlobals())

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter>{ui}</MemoryRouter></ToastProvider></QueryClientProvider>)

describe('settle form', () => {
  it('fills the oldest bills first from a lump sum and records one payment against them', async () => {
    const user = userEvent.setup()
    wrap(<SettleForm friend={rahul} open onOpenChange={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('checkbox', { name: /Settle Dinner/ })
    await user.type(within(dialog).getByRole('textbox', { name: /Fill amount/ }), '350')
    expect(within(dialog).getByRole('checkbox', { name: /Settle Dinner/ })).toBeChecked()
    expect(within(dialog).getByRole('textbox', { name: /Amount for Dinner/ })).toHaveValue('300.00')
    expect(within(dialog).getByRole('textbox', { name: /Amount for Movie/ })).toHaveValue('50.00')
    await user.click(within(dialog).getByRole('button', { name: /Record/ }))
    await waitFor(() => expect(calls.find((c) => c.path === '/settlements')).toBeTruthy())
    expect(calls.find((c) => c.path === '/settlements')!.body).toMatchObject({
      friendId: 11, accountId: 1, allocations: [{ billId: 31, amount: '300.00' }, { billId: 32, amount: '50.00' }],
    })
  })

  it('offers matching when the friend also has a bill the other way, and blocks while old payments are unlinked', async () => {
    unassigned = [txnDto({ id: 9 })]
    wrap(<SettleForm friend={rahul} open onOpenChange={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('button', { name: 'match them first' })).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/not tied to a bill yet/)
    expect(within(dialog).getByRole('button', { name: /Record/ })).toBeDisabled()
  })
})

describe('match wizard', () => {
  it('matches a split they owe you with a bill you owe them', async () => {
    const user = userEvent.setup()
    wrap(<MatchWizard friend={rahul} open onOpenChange={() => {}} />)
    await user.click(await screen.findByRole('button', { name: /Dinner/ }))
    await user.click(screen.getByRole('button', { name: /Taxi/ }))
    await user.click(screen.getByRole('button', { name: /^Match INR|^Match ₹/ }))
    await waitFor(() => expect(calls.find((c) => c.path === '/matches')).toBeTruthy())
    expect(calls.find((c) => c.path === '/matches')!.body).toMatchObject({ friendId: 11, owedToMeId: 31, owedByMeId: 33, amount: '100.00' })
  })
})

describe('linking an earlier payment', () => {
  it('ties it to the bills it paid, with amounts that add up to the payment', async () => {
    const user = userEvent.setup()
    unassigned = [txnDto({ id: 9, amount: money(10000) })]
    wrap(<LinkPaymentsDialog friend={rahul} open onOpenChange={() => {}} />)
    await user.click(await screen.findByRole('checkbox', { name: /Paid Dinner/ }))
    expect(screen.getByRole('textbox', { name: /Amount for Dinner/ })).toHaveValue('100.00')
    await user.click(screen.getByRole('button', { name: 'Link payment' }))
    await waitFor(() => expect(calls.find((c) => c.path === '/settlements/9/assign')).toBeTruthy())
    expect(calls.find((c) => c.path === '/settlements/9/assign')!.body).toEqual({ allocations: [{ billId: 31, amount: '100.00' }] })
  })
})

describe('deleting a bill with payments', () => {
  const split: Transaction = {
    id: 31, type: 'split', description: 'Dinner', memo: null, tags: [], date: '2026-09-01', currency: 'INR', status: 'posted', createdAt: 'x', updatedAt: 'x',
    amount: 500, accountId: 1, categoryId: 7, yourShare: 200, splits: [{ friendId: 11, share: 300 }],
    bill: [{ friendId: 11, amount: 300, paid: 100, matched: 0, remaining: 200, status: 'partial' }],
  }

  it('shows paid / left, and deletes the payments too only after an explicit OK', async () => {
    const user = userEvent.setup()
    deleteFails = true
    wrap(<TxnDetailDrawer txn={split} open onOpenChange={() => {}} />)
    expect(await screen.findByText('Partly settled')).toBeInTheDocument()
    expect(screen.getByText(/200\.00 left|₹200\.00 left/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click((await screen.findAllByRole('button', { name: 'Delete' })).at(-1)!) // the confirm button of the dialog
    expect(await screen.findByText('Payments rest on this bill')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete payments and bill' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2))
  })
})
