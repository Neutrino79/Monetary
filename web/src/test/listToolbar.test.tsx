/** The shared table toolbar: current-month default, month/custom/all-time dates, and server-side grouping. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TransactionTable } from '@/components/domain/TransactionTable'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { toISODate } from '@/lib/utils/clock'
import type { User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })
const txn = (id: number, description: string, groupKey: string | null) => ({
  id, type: 'expense', description, memo: null, date: '2026-10-21', currency: 'INR', status: 'posted', amount: money(10000 * id),
  accountId: null, toAccountId: null, categoryId: null, friendId: null, direction: null, yourShare: null, splits: null,
  refundOfId: null, correctionOf: null, replacedBy: null, createdAt: 'x', updatedAt: 'x', groupKey,
})

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
    const grouped = url.searchParams.get('groupBy')
    const bodies: Record<string, unknown> = {
      '/transactions': { items: [txn(1, 'Coffee', grouped ? 'Food' : null), txn(2, 'Pizza', grouped ? 'Food' : null)], total: 2, limit: 12, offset: 0 },
      '/transactions/groups': { groupBy: grouped, groups: [{ key: 'Food', label: 'Food', count: 2, totals: [{ currency: 'INR', moneyIn: money(0), moneyOut: money(30000) }] }] },
    }
    return new Response(JSON.stringify(path in bodies ? bodies[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function renderTable() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <TransactionTable allowedTypes={['expense']} title="Expenses" description="d" />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
const listCalls = () => urls.filter((u) => u.pathname.endsWith('/transactions'))
const lastList = () => listCalls()[listCalls().length - 1]

describe('table toolbar', () => {
  it('starts on the current month, and "All time" drops the date filter', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Coffee')
    const now = new Date()
    expect(lastList().searchParams.get('dateFrom')).toBe(`${toISODate(now).slice(0, 7)}-01`)
    expect(lastList().searchParams.get('dateTo')).toBe(toISODate(now))
    expect(screen.queryByText('Reset filters')).not.toBeInTheDocument()   // default state: nothing to reset

    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(await screen.findByRole('button', { name: 'All time' }))
    await waitFor(() => expect(lastList().searchParams.has('dateFrom')).toBe(false))
    expect(lastList().searchParams.has('dateTo')).toBe(false)
  })

  it('supports a custom date range', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Coffee')
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(await screen.findByRole('button', { name: 'Custom' }))
    await user.type(screen.getByLabelText('From'), '2026-03-05')
    await user.type(screen.getByLabelText('To'), '2026-03-09')
    await waitFor(() => expect(lastList().searchParams.get('dateFrom')).toBe('2026-03-05'))
    expect(lastList().searchParams.get('dateTo')).toBe('2026-03-09')
  })

  it('groups on the server and shows a header with the group count and total', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Coffee')
    expect(screen.queryByTestId('group-header')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Group'), 'category')
    const header = await screen.findByTestId('group-header')
    await waitFor(() => expect(within(header).getByText('2 transactions')).toBeInTheDocument())
    expect(lastList().searchParams.get('groupBy')).toBe('category')
    expect(urls.some((u) => u.pathname.endsWith('/transactions/groups') && u.searchParams.get('groupBy') === 'category')).toBe(true)
    expect(within(header).getByText(/300/)).toBeInTheDocument()
  })
})
