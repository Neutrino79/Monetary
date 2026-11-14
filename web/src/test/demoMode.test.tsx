/** Demo mode: the sign-in page offers "Try the demo" only when `GET /meta` says demo, and the banner shows in the app. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'

const owner = {
  id: 1, name: 'Demo User', email: 'demo@example.com', isSuperuser: true, timezone: 'UTC',
  homeCurrencyCode: 'USD', ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}
const calls: string[] = []

function stubBackend(demo: boolean) {
  const routes: Record<string, unknown> = {
    '/meta': { appName: 'Monetary', tagline: 'Personal expense ledger', version: '0.5.0', apiVersion: 'v0.5', demo },
    '/setup/status': { initialized: true },
    '/auth/demo': { access_token: 'ets_demo', token_type: 'bearer' },
    '/owner': owner,
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v0\.5/, '')
    calls.push(`${init?.method ?? 'GET'} ${path}`)
    const known = path in routes
    return new Response(JSON.stringify(known ? routes[path] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
}

function mount() {
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider><App /></ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  localStorage.clear()
  queryClient.clear()
  window.history.pushState({}, '', '/login')
  useAuthStore.setState({ user: null, isAuthenticated: false, isHydrating: false, hydrateError: null, sessionExpired: false })
})
afterEach(() => vi.unstubAllGlobals())

describe('demo mode', () => {
  it('hides the demo button on a normal server', async () => {
    stubBackend(false)
    mount()
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByRole('button', { name: 'Try the demo' })).toBeNull()
  })

  it('signs in with one click and shows the demo banner', async () => {
    stubBackend(true)
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Try the demo' }))
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
    expect(calls).toContain('POST /auth/demo')
    expect(await screen.findByRole('status')).toHaveTextContent(/Demo mode/)
  })
})
