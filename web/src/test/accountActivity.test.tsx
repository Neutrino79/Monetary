/** Accounts page: card figures, last activity, the activity drawer with running balance, and reconciling. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AccountsPage } from '@/pages/AccountsPage'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { toISODate } from '@/lib/utils/clock'

const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })
const yesterday = toISODate(new Date(Date.now() - 86_400_000))
const acct = (over: object) => ({
  id: 1, name: 'HDFC', accountType: 'ASSET', currencyCode: 'INR', isActive: true, subtype: 'bank', creditLimit: null,
  statementDay: null, balance: money(1250000), lastActivity: yesterday, createdAt: 'x', updatedAt: 'x', ...over,
})
const row = (entryId: number, description: string, date: string, delta: number, running: number) =>
  ({ entryId, description, entryType: 'NORMAL', entryDate: date, date, status: 'POSTED', delta: money(delta), runningBalance: money(running) })

let posts: { url: string; body: unknown }[]
beforeEach(() => {
  posts = []
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: { id: 1, name: 'Asha', email: 'a@x.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR', ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x' }, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    if (init?.method === 'POST') {
      posts.push({ url: path, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ difference: money(5000), entryId: 9 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const bodies: Record<string, unknown> = {
      '/accounts': [
        acct({}),
        acct({ id: 2, name: 'Visa', accountType: 'LIABILITY', subtype: 'credit_card', creditLimit: money(10000000), statementDay: 28, balance: money(2500000), lastActivity: null }),
      ],
      '/accounts/1/statement': [row(5, 'Salary', '2026-10-01', 1500000, 1500000), row(6, 'Rent', '2026-10-02', -250000, 1250000)],
    }
    return new Response(JSON.stringify(path in bodies ? bodies[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const renderPage = () =>
  render(<QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter><AccountsPage /></MemoryRouter></ToastProvider></QueryClientProvider>)

describe('accounts', () => {
  it('shows last activity and credit-card availability and utilisation', async () => {
    renderPage()
    expect(await screen.findByText('Last activity yesterday')).toBeInTheDocument()
    expect(screen.getByText('No activity yet')).toBeInTheDocument()
    expect(screen.getByText(/₹75,000 available of ₹1,00,000|₹75,000 available of ₹100,000/)).toBeInTheDocument()
    expect(screen.getByText('25% used')).toBeInTheDocument()
    expect(screen.getByText(/Statement (today|tomorrow|in \d+ days) \(day 28\)/)).toBeInTheDocument()
  })

  it('opens the activity with the balance after each line, newest first', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'HDFC activity' }))
    const list = await screen.findByRole('list', { name: 'HDFC activity' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Rent')
    expect(items[0]).toHaveTextContent('Balance ₹12,500.00')
    expect(items[1]).toHaveTextContent('Salary')
  })

  it('reconciles with the bank balance the person types', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'HDFC activity' }))
    await user.click(await screen.findByRole('button', { name: /Reconcile/ }))
    await user.type(await screen.findByLabelText('Balance per bank'), '12550')
    expect(await screen.findByRole('status')).toHaveTextContent(/₹50\.00 adjustment .*balance goes up/)
    await user.click(screen.getByRole('button', { name: 'Match to bank' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].url).toBe('/accounts/1/reconcile')
    expect(posts[0].body).toMatchObject({ balance: '12550.00' })
  })
})
