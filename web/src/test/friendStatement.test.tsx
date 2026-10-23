/** The per-friend statement: every shared expense and settlement with the balance after it. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { FriendsPage } from '@/pages/FriendsPage'
import { describeStatementRow, balanceSentence } from '@/lib/utils/statement'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import type { StatementRow, User } from '@/types'

const owner: User = {
  id: 1, name: 'Asha', email: 'a@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })
const row = (entryId: number, entryType: string, date: string, delta: number, running: number, status = 'POSTED', description = `Entry ${entryId}`) => ({
  entryId, description, entryType, entryDate: `${date}T10:00:00Z`, date, status, delta: money(delta), runningBalance: money(running),
})

const routes: Record<string, unknown> = {
  '/friends': [{ id: 11, name: 'Rahul', email: 'r@example.com', phone: null, dueAccountId: 21, createdAt: 'x' }],
  '/friends/balances': [{ friendId: 11, friendName: 'Rahul', balance: money(20000), frontedUnpaid: money(0) }],
  '/friends/11/statement': [
    row(1, 'SPLIT', '2026-10-01', 35000, 35000, 'POSTED', 'Dinner'),
    row(2, 'FRONTED', '2026-10-05', -5000, 30000, 'POSTED', 'Tea'),
    row(3, 'SETTLEMENT', '2026-10-09', -10000, 20000, 'POSTED', 'Settlement from Rahul'),
    row(4, 'SPLIT', '2026-10-10', 9900, 29900, 'REVERSED', 'Old version'),
    row(5, 'REVERSAL', '2026-10-10', -9900, 20000, 'POSTED', 'Correction (reversed)'),
  ],
}

beforeEach(() => {
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: owner, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v0\.5/, '')
    return new Response(JSON.stringify(path in routes ? routes[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('friend statement', () => {
  it('lists each shared item newest first with its effect and the balance after it', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter>
            <FriendsPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'Statement with Rahul' }))
    const list = await screen.findByRole('list', { name: 'Statement with Rahul' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)                                              // reversed and reversal rows are hidden
    expect(items.map((li) => within(li).getByText(/^Entry|Dinner|Tea|Settlement/).textContent)).toEqual(['Settlement from Rahul', 'Tea', 'Dinner'])
    expect(within(items[0]).getByText(/Rahul paid you back/)).toBeInTheDocument()
    expect(within(items[0]).getByText(/Balance .*200.* owed to you/)).toBeInTheDocument()
    expect(within(items[2]).getByText(/\+.*350/)).toBeInTheDocument()
    expect(screen.getAllByText('Rahul owes you ₹200.00').length).toBeGreaterThan(0)
  })
})

describe('statement wording', () => {
  const base: StatementRow = { entryId: 1, description: 'x', entryType: 'SPLIT', date: '2026-10-01', delta: 10, runningBalance: 10 }
  it('says in words what each kind of line did', () => {
    expect(describeStatementRow(base, 'Rahul')).toBe("You paid; Rahul's share")
    expect(describeStatementRow({ ...base, entryType: 'FRONTED', delta: -5 }, 'Rahul')).toBe('Rahul paid for you')
    expect(describeStatementRow({ ...base, entryType: 'SETTLEMENT', delta: -5 }, 'Rahul')).toBe('Rahul paid you back')
    expect(describeStatementRow({ ...base, entryType: 'SETTLEMENT', delta: 5 }, 'Rahul')).toBe('You paid Rahul back')
  })
  it('describes the balance from your side', () => {
    expect(balanceSentence(0, 'Rahul')).toBe('All settled up')
    expect(balanceSentence(50, 'Rahul')).toMatch(/^Rahul owes you/)
    expect(balanceSentence(-50, 'Rahul')).toMatch(/^You owe Rahul/)
  })
})
