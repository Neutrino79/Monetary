/** Refund management: the summary on a purchase, linking both ways, and recording / editing / deleting refunds. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TxnDetailDrawer } from '@/components/domain/TxnDetailDrawer'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { summariseRefunds } from '@/lib/utils/refunds'
import type { Transaction, User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (rupees: number) => ({ points: Math.round(rupees * 100), major: `INR ${rupees.toFixed(2)}`, currency: 'INR' })

const account = (id: number, name: string) => ({ id, name, accountType: 'ASSET', currencyCode: 'INR', isActive: true, subtype: 'bank', creditLimit: null, statementDay: null, balance: money(10000), createdAt: 'x', updatedAt: 'x' })
const routes: Record<string, unknown> = {
  '/accounts': [account(1, 'HDFC Savings'), account(2, 'Cash wallet')],
  '/categories': [{ id: 7, name: 'Shopping', accountType: 'EXPENSE', currencyCode: 'INR', parentId: null, budgetLimit: null, color: null, isActive: true, createdAt: 'x', updatedAt: 'x' }],
}

const dto = (over: Record<string, unknown>) => ({
  id: 5, type: 'expense', description: 'Headphones and case', memo: null, tags: [], date: '2026-10-10', currency: 'INR', status: 'posted',
  amount: money(500), accountId: 1, toAccountId: null, categoryId: 7, friendId: null, direction: null, yourShare: null,
  splits: null, refundOfId: null, correctionOf: null, replacedBy: null, createdAt: 'x', updatedAt: 'x', unpaid: null, groupKey: null,
  ...over,
})
const purchaseDto = dto({})
const refundDto = (id: number, rupees: number, date = '2026-10-12') =>
  dto({ id, type: 'refund', description: 'Refund — Headphones and case', amount: money(rupees), refundOfId: 5, date })

const purchase: Transaction = {
  id: 5, type: 'expense', description: 'Headphones and case', memo: null, tags: [], date: '2026-10-10', currency: 'INR',
  status: 'posted', createdAt: 'x', updatedAt: 'x', amount: 500, accountId: 1, categoryId: 7,
}

let refundDtos: unknown[]
let posted: Record<string, unknown>[]
let patched: { path: string; body: Record<string, unknown> }[]
let deleted: string[]

beforeEach(() => {
  refundDtos = [refundDto(8, 200)]
  posted = []
  patched = []
  deleted = []
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (init?.method === 'POST' && path === '/transactions') {
      posted.push(JSON.parse(String(init.body)))
      return json(refundDto(9, 300), 201)
    }
    if (init?.method === 'PATCH') {
      patched.push({ path, body: JSON.parse(String(init.body)) })
      return json(refundDto(8, 250))
    }
    if (init?.method === 'DELETE') {
      deleted.push(path)
      return json({ detail: 'deleted' })
    }
    if (path === '/transactions') {
      const wantsRefunds = [...url.searchParams.keys()].some((k) => /refund/i.test(k))
      const items = wantsRefunds ? refundDtos : []
      return json({ items, total: items.length, limit: 200, offset: 0 })
    }
    if (path === '/transactions/5') return json(purchaseDto)
    const refund = (refundDtos as { id: number }[]).find((r) => path === `/transactions/${r.id}`)
    if (refund) return json(refund)
    return json(path in routes ? routes[path] : [])
  }))
})
afterEach(() => vi.unstubAllGlobals())

function open(txn: Transaction = purchase) {
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <TxnDetailDrawer txn={txn} open onOpenChange={onOpenChange} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return onOpenChange
}

describe('summariseRefunds', () => {
  it('works in whole cents', () => {
    const s = summariseRefunds(0.3, [{ amount: 0.1 }, { amount: 0.2 }])
    expect(s).toMatchObject({ refunded: 0.3, remaining: 0, net: 0, count: 2, complete: true, pct: 100 })
    expect(summariseRefunds(500, [{ amount: 200 }])).toMatchObject({ refunded: 200, remaining: 300, net: 300, complete: false, pct: 40 })
    expect(summariseRefunds(500, [])).toMatchObject({ refunded: 0, remaining: 500, count: 0, complete: false })
  })
})

describe('refunds on a purchase', () => {
  it('shows how much was refunded, what is left and the net cost', async () => {
    open()
    expect(await screen.findByText('₹200.00 of ₹500.00 refunded')).toBeInTheDocument()
    expect(screen.getByText(/₹300.00 can still be refunded/)).toBeInTheDocument()
    expect(screen.getByText(/Net cost ₹300.00/)).toBeInTheDocument()
  })

  it('links both ways: purchase to refund, and the refund back to its purchase', async () => {
    open()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: /Refund — Headphones and case/ }))
    // now looking at the refund: it names and links its purchase
    expect(await screen.findByText('Refund of')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Back to Headphones and case/ })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /Headphones and case \(₹500\)/ }))
    // and we are on the purchase again, with its refund list
    expect(await screen.findByText('₹200.00 of ₹500.00 refunded')).toBeInTheDocument()
    expect(screen.queryByText('Refund of')).toBeNull()
  })

  it('Back returns to where you came from', async () => {
    open()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: /Refund — Headphones and case/ }))
    await u.click(await screen.findByRole('button', { name: /Back to Headphones and case/ }))
    expect(await screen.findByText('₹200.00 of ₹500.00 refunded')).toBeInTheDocument()
  })

  it('opens the refund form on what is left, tells you what was refunded, and records the next refund', async () => {
    open()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Record refund' }))
    const dialog = await screen.findByRole('dialog', { name: /Record a refund/ })
    expect(within(dialog).getByText(/₹200\.00 has already been refunded \(1 refund\), so up to ₹300\.00 can still be refunded/)).toBeInTheDocument()
    const amount = within(dialog).getByLabelText('Refund amount') as HTMLInputElement
    expect(amount.value).toBe('300')
    await u.click(within(dialog).getByRole('button', { name: 'Record refund' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ type: 'refund', amount: '300.00', refundOfId: 5, accountId: 1 })
  })

  it('refuses a refund above what is left', async () => {
    open()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Record refund' }))
    const dialog = await screen.findByRole('dialog', { name: /Record a refund/ })
    const amount = within(dialog).getByLabelText('Refund amount')
    await u.clear(amount)
    await u.type(amount, '350')
    await u.click(within(dialog).getByRole('button', { name: 'Record refund' }))
    expect(await within(dialog).findByText('Only ₹300.00 can still be refunded.')).toBeInTheDocument()
    expect(posted).toHaveLength(0)
  })

  it('shows "Fully refunded" and no more refunds once everything is back', async () => {
    refundDtos = [refundDto(8, 200), refundDto(9, 300)]
    open()
    const button = await screen.findByRole('button', { name: 'Fully refunded' })
    expect(button).toBeDisabled()
    expect(screen.getByText(/Nothing left to refund/)).toBeInTheDocument()
  })

  it('does not offer to delete a purchase that still has refunds, and says why', async () => {
    open()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('This purchase has refunds')).toBeInTheDocument()
    expect(screen.getByText(/Delete the refund first/)).toBeInTheDocument()
    expect(deleted).toHaveLength(0)
  })
})

describe('managing a refund', () => {
  const asRefund = (): Transaction => ({ ...purchase, id: 8, type: 'refund', description: 'Refund — Headphones and case', amount: 200, refundOfId: 5, date: '2026-10-12' })

  it('edits a refund: amount, account and date are changeable, within what the purchase allows', async () => {
    const onOpenChange = open(asRefund())
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Edit refund' }))
    const dialog = await screen.findByRole('dialog', { name: /Edit refund/ })
    expect(within(dialog).getByText(/The other refunds total ₹0\.00, so this one can be up to ₹500\.00/)).toBeInTheDocument()
    const amount = within(dialog).getByLabelText('Refund amount')
    await u.clear(amount)
    await u.type(amount, '250')
    await u.click(within(dialog).getByRole('combobox', { name: /Refunded into/ }))
    await u.click(await screen.findByRole('option', { name: 'Cash wallet' }))
    await u.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(patched).toHaveLength(1))
    expect(patched[0]!.path).toBe('/transactions/8')
    expect(patched[0]!.body).toMatchObject({ amount: '250.00', accountId: 2 })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('cannot raise a refund above the purchase', async () => {
    open(asRefund())
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Edit refund' }))
    const dialog = await screen.findByRole('dialog', { name: /Edit refund/ })
    const amount = within(dialog).getByLabelText('Refund amount')
    await u.clear(amount)
    await u.type(amount, '600')
    await u.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByText('This refund can be at most ₹500.00.')).toBeInTheDocument()
    expect(patched).toHaveLength(0)
  })

  it('deletes a refund after confirming', async () => {
    open(asRefund())
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this refund?' })
    await u.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleted).toEqual(['/transactions/8']))
  })
})
