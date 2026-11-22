/**
 * UI behaviour with a stubbed `fetch` (no server): branding from the backend,
 * the one-time setup rules, error and session handling. The same flows run
 * against a real backend in src/test/integration/.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'

type Handler = (req: { url: URL; method: string; body: unknown }) => { status?: number; json?: unknown }
let handlers: Record<string, Handler> = {}
const calls: string[] = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  localStorage.clear()
  calls.length = 0
  handlers = {}
  queryClient.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const key = `${method} ${url.pathname.replace(/^\/api\/v0\.5/, '')}`
    calls.push(key)
    const h = handlers[key]
    if (!h) return json({ detail: `unhandled ${key}`, error_type: 'NotFoundError' }, 404)
    const r = h({ url, method, body: init?.body })
    return json(r.json ?? {}, r.status ?? 200)
  }))
})

afterEach(() => vi.unstubAllGlobals())

function renderApp(path: string) {
  window.history.pushState({}, '', path)
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const meta = (appName: string) => ({ json: { appName, tagline: 'Money, tidy', version: '0.5.0', apiVersion: 'v0.5' } })

describe('branding comes from the backend', () => {
  it('shows the name served by /meta, not a hard-coded one', async () => {
    handlers['GET /meta'] = () => meta('Ledgerly')
    handlers['GET /setup/status'] = () => ({ json: { initialized: true } })
    renderApp('/login')
    expect(await screen.findByText('Ledgerly')).toBeInTheDocument()
    expect(screen.queryByText('Khata')).not.toBeInTheDocument()
  })

  it('falls back to the configured default name when the backend is unreachable', async () => {
    handlers['GET /setup/status'] = () => ({ json: { initialized: true } })
    renderApp('/login')
    expect(await screen.findByText('Monetary')).toBeInTheDocument() // /meta -> 404 in this stub
  })
})

describe('first-run setup and account requests', () => {
  it('sends a visitor to setup until the owner exists, and there is no "create account" link on login', async () => {
    handlers['GET /meta'] = () => meta('Monetary')
    handlers['GET /setup/status'] = () => ({ json: { initialized: false } })
    handlers['GET /auth/security-questions'] = () => ({ json: [{ id: 1, text: 'What was the name of your first pet?' }] })
    renderApp('/login')
    expect(await screen.findByText('Set up your ledger')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/signup')
    expect(await screen.findByText('What was the name of your first pet?')).toBeInTheDocument()
  })

  it('turns the page into an account request once the instance is initialised (setup can never run twice)', async () => {
    handlers['GET /meta'] = () => meta('Monetary')
    handlers['GET /setup/status'] = () => ({ json: { initialized: true } })
    handlers['GET /auth/security-questions'] = () => ({ json: [{ id: 1, text: 'Pet?' }] })
    renderApp('/signup')
    expect(await screen.findByRole('heading', { name: 'Request an account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request account' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create administrator account' })).not.toBeInTheDocument()
    expect(calls).not.toContain('POST /setup/init') // nothing was submitted
  })

  it('checks the status again before submitting and shows the already-set-up panel instead of posting', async () => {
    let initialized = false
    handlers['GET /meta'] = () => meta('Monetary')
    handlers['GET /setup/status'] = () => ({ json: { initialized } })
    handlers['GET /auth/security-questions'] = () => ({ json: [{ id: 1, text: 'Pet?' }] })
    const user = userEvent.setup()
    renderApp('/signup')
    await screen.findByText('Set up your ledger')
    initialized = true // someone else finished setup while this form was open
    await user.type(screen.getByLabelText('Full name'), 'Asha')
    await user.type(screen.getByLabelText('Email'), 'asha@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-1')
    await user.type(screen.getByLabelText('Confirm password'), 'correct-horse-1')
    await user.type(screen.getByLabelText('Your answer'), 'whiskers')
    await user.click(screen.getByRole('button', { name: 'Create administrator account' }))
    // the form turns into a request for an account instead of dead-ending, and nothing is sent to /setup/init
    expect(await screen.findByRole('heading', { name: 'Request an account' })).toBeInTheDocument()
    expect(calls).not.toContain('POST /setup/init')
  })
})

describe('login and session handling', () => {
  beforeEach(() => {
    handlers['GET /meta'] = () => meta('Monetary')
    handlers['GET /setup/status'] = () => ({ json: { initialized: true } })
  })

  it('shows the server message for a wrong password (401), without treating it as an expired session', async () => {
    handlers['POST /auth/login'] = () => ({ status: 401, json: { detail: 'Invalid email or password.', error_type: 'AuthenticationError' } })
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'asha@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
    expect(useAuthStore.getState().sessionExpired).toBe(false)
  })

  it('logs the user out and says why when a stored session is rejected', async () => {
    localStorage.setItem('emx_token', 'ets_stale')
    handlers['GET /me'] = () => ({ status: 401, json: { detail: 'Invalid or expired session.', error_type: 'AuthenticationError' } })
    useAuthStore.setState({ isHydrating: true })
    renderApp('/dashboard')
    await useAuthStore.getState().hydrate()
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    expect(localStorage.getItem('emx_token')).toBeNull()
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument()
  })

  it('does NOT log the user out when the server is merely unreachable; offers a retry', async () => {
    localStorage.setItem('emx_token', 'ets_good')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    useAuthStore.setState({ isHydrating: true })
    renderApp('/dashboard')
    await useAuthStore.getState().hydrate()
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(localStorage.getItem('emx_token')).toBe('ets_good') // still signed in locally
    await waitFor(() => expect(useAuthStore.getState().hydrateError).toBeTruthy())
  })
})
