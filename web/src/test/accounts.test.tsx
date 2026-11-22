/**
 * Accounts on a multi-user server (stubbed `fetch`): asking for an account, what a person sees when
 * their account is not usable yet, and the forced replacement of an administrator's temporary password.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'

type Handler = (req: { body: unknown }) => { status?: number; json?: unknown }
let handlers: Record<string, Handler> = {}
const calls: string[] = []
const bodies: Record<string, unknown> = {}
const sentHeaders: Record<string, Record<string, string>> = {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const meta = (demo = false) => ({ json: { appName: 'Monetary', tagline: 'Money, tidy', version: '0.5.0', apiVersion: 'v0.5', demo } })
const account = (over: Record<string, unknown> = {}) => ({
  id: 2, email: 'ravi@example.com', name: 'Ravi', role: 'user', status: 'active', mustChangePassword: false, hasLedger: true, ...over,
})
const owner = {
  id: 1, name: 'Ravi', email: 'ravi@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}

beforeEach(() => {
  localStorage.clear()
  calls.length = 0
  for (const k of Object.keys(bodies)) delete bodies[k]
  for (const k of Object.keys(sentHeaders)) delete sentHeaders[k]
  handlers = {}
  queryClient.clear()
  useAuthStore.setState({ user: null, account: null, isAuthenticated: false, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v0\.5/, '')}`
    calls.push(key)
    bodies[key] = init?.body
    sentHeaders[key] = (init?.headers ?? {}) as Record<string, string>
    const h = handlers[key]
    if (!h) return json({ detail: `unhandled ${key}`, error_type: 'NotFoundError' }, 404)
    const r = h({ body: init?.body })
    return json(r.json ?? {}, r.status ?? 200)
  }))
  handlers['GET /meta'] = () => meta()
  handlers['GET /auth/captcha'] = () => ({ json: { provider: 'none', challenge: null, siteKey: null } })
  handlers['GET /setup/status'] = () => ({ json: { initialized: true } })
  handlers['GET /auth/security-questions'] = () => ({ json: [{ id: 1, text: 'Pet?' }] })
})
afterEach(() => vi.unstubAllGlobals())

function renderApp(path: string) {
  window.history.pushState({}, '', path)
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider><App /></ToastProvider>
    </QueryClientProvider>,
  )
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'ravi@example.com')
  await user.type(screen.getByLabelText('Password'), 'some-password-1')  // pragma: allowlist secret
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('asking for an account', () => {
  it('sends the request and shows one neutral confirmation', async () => {
    handlers['POST /auth/register'] = () => ({ status: 202, json: { detail: 'Request received.' } })
    const user = userEvent.setup()
    renderApp('/login')
    await user.click(await screen.findByRole('link', { name: 'Request an account' }))
    await screen.findByRole('heading', { name: 'Request an account' })
    await user.type(screen.getByLabelText('Full name'), 'Ravi Kumar')
    await user.type(screen.getByLabelText('Email'), 'ravi@example.com')
    await user.type(screen.getByLabelText('Password'), 'ravi-password-1')  // pragma: allowlist secret
    await user.type(screen.getByLabelText('Confirm password'), 'ravi-password-1')  // pragma: allowlist secret
    await user.type(screen.getByLabelText('Your answer'), 'whiskers')
    await user.click(screen.getByRole('button', { name: 'Request account' }))
    expect(await screen.findByRole('heading', { name: 'Request received' })).toBeInTheDocument()
    const sent = JSON.parse(String(bodies['POST /auth/register']))
    expect(sent).toMatchObject({ name: 'Ravi Kumar', email: 'ravi@example.com', securityQuestionId: 1, securityAnswer: 'whiskers' })
    expect(sent.currency).toHaveLength(3)
    expect(calls).not.toContain('POST /setup/init')
    expect(useAuthStore.getState().isAuthenticated).toBe(false) // a request is not a sign-in
  })

  it('validates the form before sending anything', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await screen.findByRole('heading', { name: 'Request an account' })
    await user.click(screen.getByRole('button', { name: 'Request account' }))
    expect(await screen.findByText('Enter your name.')).toBeInTheDocument()
    expect(calls).not.toContain('POST /auth/register')
  })

  it('has no sign-up in demo mode', async () => {
    handlers['GET /meta'] = () => meta(true)
    renderApp('/signup')
    expect(await screen.findByRole('button', { name: 'Start the demo' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('link', { name: 'Request an account' })).toBeNull()
  })
})

describe('an account that cannot sign in', () => {
  it.each([
    ['AccountPendingApproval', 'Waiting for approval'],
    ['AccountRejected', 'Request not approved'],
    ['AccountSuspended', 'Account suspended'],
    ['AccountPendingDelete', 'Account scheduled for deletion'],
  ])('%s shows a status notice, not a form error', async (code, title) => {
    handlers['POST /auth/login'] = () => ({ status: 403, json: { detail: 'blocked', error_type: code } })
    const user = userEvent.setup()
    renderApp('/login')
    await signIn(user)
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(localStorage.getItem('emx_token')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('temporary password', () => {
  it('blocks the app until it is replaced, then asks for a fresh sign-in', async () => {
    handlers['POST /auth/login'] = () => ({ json: { access_token: 'ets_temp', token_type: 'bearer' } })
    handlers['GET /me'] = () => ({ json: account({ mustChangePassword: true }) })
    handlers['POST /auth/change-password'] = () => ({ json: { detail: 'Password changed.' } })
    const user = userEvent.setup()
    renderApp('/login')
    await signIn(user)
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(calls).not.toContain('GET /owner') // the ledger stays locked
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText('Enter the temporary password you were given.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Temporary password'), 'Temp-Pass-123')  // pragma: allowlist secret
    await user.type(screen.getByLabelText('New password'), 'my-own-password-1')  // pragma: allowlist secret
    await user.type(screen.getByLabelText('Confirm new password'), 'my-own-password-1')  // pragma: allowlist secret
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(JSON.parse(String(bodies['POST /auth/change-password']))).toEqual({ currentPassword: 'Temp-Pass-123', newPassword: 'my-own-password-1' })  // pragma: allowlist secret
    expect(localStorage.getItem('emx_token')).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('refuses to keep the temporary password and mismatched confirmations', async () => {
    handlers['POST /auth/login'] = () => ({ json: { access_token: 'ets_temp', token_type: 'bearer' } })
    handlers['GET /me'] = () => ({ json: account({ mustChangePassword: true }) })
    const user = userEvent.setup()
    renderApp('/login')
    await signIn(user)
    await screen.findByRole('heading', { name: 'Choose a new password' })
    await user.type(screen.getByLabelText('Temporary password'), 'Temp-Pass-123')  // pragma: allowlist secret
    await user.type(screen.getByLabelText('New password'), 'Temp-Pass-123')  // pragma: allowlist secret
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText('Choose a password different from the temporary one.')).toBeInTheDocument()
    expect(calls).not.toContain('POST /auth/change-password')
  })

  it('is also enforced when the page is reloaded with a stored session', async () => {
    localStorage.setItem('emx_token', 'ets_temp')
    handlers['GET /me'] = () => ({ json: account({ mustChangePassword: true }) })
    useAuthStore.setState({ isHydrating: true })
    renderApp('/dashboard')
    await useAuthStore.getState().hydrate()
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
  })
})

describe('who is signed in', () => {
  it('reads the platform account and the ledger owner when a stored session is restored', async () => {
    localStorage.setItem('emx_token', 'ets_ok')
    handlers['GET /me'] = () => ({ json: account({ role: 'superuser' }) })
    handlers['GET /owner'] = () => ({ json: owner })
    await useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.account?.role).toBe('superuser')
    expect(state.user?.name).toBe('Ravi')
  })

  it('treats an account with no ledger as a problem to report, not a crash', async () => {
    localStorage.setItem('emx_token', 'ets_ok')
    handlers['GET /me'] = () => ({ json: account({ hasLedger: false }) })
    handlers['GET /owner'] = () => ({ status: 403, json: { detail: 'This account has no ledger.', error_type: 'NoLedgerError' } })
    await useAuthStore.getState().hydrate()
    await waitFor(() => expect(useAuthStore.getState().hydrateError).toBe('This account has no ledger.'))
    expect(localStorage.getItem('emx_token')).toBe('ets_ok')
  })
})

describe('asking again after a rejection', () => {
  it('offers Request again, which opens the form with the email filled in', async () => {
    handlers['POST /auth/login'] = () => ({ status: 403, json: { detail: 'declined', error_type: 'AccountRejected' } })
    const user = userEvent.setup()
    renderApp('/login')
    await signIn(user)
    await user.click(await screen.findByRole('button', { name: 'Request again' }))
    expect(await screen.findByRole('heading', { name: 'Request an account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('ravi@example.com')
  })

  it('has no Request again once the re-requests are used up', async () => {
    handlers['POST /auth/login'] = () => ({ status: 403, json: { detail: 'declined', error_type: 'AccountRejectedFinal' } })
    const user = userEvent.setup()
    renderApp('/login')
    await signIn(user)
    expect(await screen.findByRole('heading', { name: 'Request not approved' })).toBeInTheDocument()
    expect(screen.getByText(/used all of your new requests/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request again' })).toBeNull()
  })

  it('explains an expired temporary password', async () => {
    handlers['POST /auth/login'] = () => ({ status: 403, json: { detail: 'expired', error_type: 'TemporaryPasswordExpired' } })
    const user = userEvent.setup()
    renderApp('/login')
    await signIn(user)
    expect(await screen.findByRole('heading', { name: 'Temporary password expired' })).toBeInTheDocument()
  })

  it('shows the lock message from the server as a form error', async () => {
    handlers['POST /auth/login'] = () => ({ status: 429, json: { detail: 'Too many failed attempts. Try again in 15 minutes.', error_type: 'AccountLocked' } })
    const user = userEvent.setup()
    renderApp('/login')
    await signIn(user)
    expect(await screen.findByText(/Try again in 15 minutes/)).toBeInTheDocument()
  })
})

describe('captcha and honeypot', () => {
  it('retries the sign-in with a solved captcha when the server asks for one', async () => {
    const { createHash, webcrypto } = await import('node:crypto')
    vi.stubGlobal('crypto', webcrypto)
    const salt = 'abc?expires=9999999999'
    const challenge = createHash('sha256').update(`${salt}7`).digest('hex')
    handlers['GET /auth/captcha'] = () => ({ json: { provider: 'altcha', siteKey: null, challenge: { algorithm: 'SHA-256', challenge, salt, maxnumber: 50, signature: 'sig' } } })
    let attempts = 0
    handlers['POST /auth/login'] = () => (++attempts === 1
      ? { status: 400, json: { detail: 'captcha', error_type: 'CaptchaRequired' } }
      : { json: { access_token: 'ets_ok', token_type: 'bearer' } })
    handlers['GET /me'] = () => ({ json: account() })
    handlers['GET /owner'] = () => ({ json: owner })
    const user = userEvent.setup()
    renderApp('/login')
    await signIn(user)
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
    expect(attempts).toBe(2)
    const header = sentHeaders['POST /auth/login']['X-Captcha']
    expect(JSON.parse(atob(header))).toMatchObject({ number: 7, salt, challenge, signature: 'sig' })
  })

  it('sends the hidden website field only when something filled it in', async () => {
    handlers['POST /auth/register'] = () => ({ status: 202, json: { detail: 'ok' } })
    const user = userEvent.setup()
    const { container } = renderApp('/signup')
    await screen.findByRole('heading', { name: 'Request an account' })
    await user.type(screen.getByLabelText('Full name'), 'Bot Bot')
    await user.type(screen.getByLabelText('Email'), 'bot@example.com')
    await user.type(screen.getByLabelText('Password'), 'bot-password-1')  // pragma: allowlist secret
    await user.type(screen.getByLabelText('Confirm password'), 'bot-password-1')  // pragma: allowlist secret
    await user.type(screen.getByLabelText('Your answer'), 'x')
    await user.type(container.querySelector('#su-website') as HTMLInputElement, 'http://spam.example')
    await user.click(screen.getByRole('button', { name: 'Request account' }))
    await screen.findByRole('heading', { name: 'Request received' })
    expect(JSON.parse(String(bodies['POST /auth/register'])).website).toBe('http://spam.example')
  })
})
