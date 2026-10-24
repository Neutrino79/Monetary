import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BudgetSuggestions } from '@/components/domain/BudgetSuggestions'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'

const money = (points: number) => ({ points, major: `INR ${(points / 100).toFixed(2)}`, currency: 'INR' })
const cat = (id: number, name: string, budget: number | null) => ({
  id, name, accountType: 'EXPENSE', currencyCode: 'INR', parentId: null, budgetLimit: budget == null ? null : money(budget), color: null, isActive: true, createdAt: 'x', updatedAt: 'x',
})
const total = (categoryId: number, categoryName: string, points: number) => ({ categoryId, categoryName, total: money(points), children: [] })

let patches: { url: string; body: unknown }[]
beforeEach(() => {
  patches = []
  localStorage.setItem('emx_token', 'ets_test')
  queryClient.clear()
  useAuthStore.setState({ user: { id: 1, name: 'A', email: 'a@x.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR', ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x' }, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v0\.5/, '')
    if (init?.method === 'PATCH') { patches.push({ url: path, body: JSON.parse(String(init.body)) }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
    const month = url.searchParams.get('month') ?? ''
    const bodies: Record<string, unknown> = {
      '/categories': [cat(1, 'Food', 500000), cat(2, 'Transport', null), cat(3, 'Fun', null)],
      '/reports/spending': month.endsWith('09')
        ? [total(2, 'Transport', 180000)]
        : [total(1, 'Food', 90000), total(2, 'Transport', 143000), total(3, 'Fun', 0)],
    }
    return new Response(JSON.stringify(path in bodies ? bodies[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('BudgetSuggestions', () => {
  it('suggests limits only for categories with spend and no budget, and sets one on tap', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter><BudgetSuggestions month="2026-10" /></MemoryRouter></ToastProvider></QueryClientProvider>,
    )
    const btn = await screen.findByRole('button', { name: /Set Transport budget/ })
    expect(btn).toHaveTextContent('₹1,800')                    // max(1,430 now, 1,800 last month), already tidy
    expect(screen.queryByText('Food')).not.toBeInTheDocument()  // already has a budget
    expect(screen.queryByText('Fun')).not.toBeInTheDocument()   // nothing spent
    await user.click(btn)
    await vi.waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].url).toBe('/categories/2')
  })
})
