/** The Admin area (stubbed `fetch`): who can reach it, and the account actions an administrator takes. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'

type Handler = (req: { url: URL; body: unknown }) => { status?: number; json?: unknown }
let handlers: Record<string, Handler> = {}
const calls: string[] = []
const urls: Record<string, URL> = {}
const bodies: Record<string, unknown> = {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const user = (over: Record<string, unknown> = {}) => ({
  id: 5, email: 'ravi@example.com', name: 'Ravi Kumar', role: 'user', status: 'active', statusReason: null, mustChangePassword: false,
  timezone: 'Asia/Kolkata', homeCurrencyCode: 'INR', plan: 'manual', accessUntil: null, deleteAfter: null, lastLoginAt: null,
  lockedUntil: null, passwordExpiresAt: null, rerequestCount: 0, approvedAt: null, approvedBy: null, createdAt: '2026-11-01T10:00:00+00:00', updatedAt: '2026-11-01T10:00:00+00:00', ...over,
})
const page = (items: unknown[]) => ({ items, total: items.length, limit: 50, offset: 0 })
const owner = {
  id: 1, name: 'Admin', email: 'admin@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}

function signIn(role: 'user' | 'superuser') {
  useAuthStore.setState({
    user: owner as never, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false,
    account: { id: 1, email: 'admin@example.com', name: 'Admin', role, status: 'active', mustChangePassword: false, hasLedger: true },
  })
}

beforeEach(() => {
  localStorage.clear()
  calls.length = 0
  for (const k of Object.keys(bodies)) delete bodies[k]
  handlers = {}
  queryClient.clear()
  useAuthStore.setState({ user: null, account: null, isAuthenticated: false, isHydrating: false, hydrateError: null, sessionExpired: false })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v0\.5/, '')}`
    calls.push(key)
    urls[key] = url
    bodies[key] = init?.body
    const h = handlers[key]
    if (!h) return json({ detail: `unhandled ${key}`, error_type: 'NotFoundError' }, 404)
    const r = h({ url, body: init?.body })
    return json(r.json ?? {}, r.status ?? 200)
  }))
  handlers['GET /meta'] = () => ({ json: { appName: 'Monetary', tagline: 't', version: '0.5.0', apiVersion: 'v0.5', demo: false } })
  handlers['GET /admin/stats'] = () => ({
    json: { totalUsers: 4, byStatus: { active: 2, pending_approval: 2 }, pendingApproval: 2, activeSuperusers: 1, ledgerCount: 3, ledgerBytes: 3145728 },
  })
  handlers['GET /admin/audit-log'] = () => ({
    json: page([{ id: 1, at: '2026-11-02T10:00:00+00:00', actorUserId: 1, action: 'user.approve', targetUserId: 5, detail: '{"reason":"ok"}', ip: '1.2.3.4' }]),
  })
  handlers['GET /admin/users'] = () => ({ json: page([user()]) })
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

describe('who can open the Admin area', () => {
  it('sends a regular user back to their ledger and shows no Admin button', async () => {
    signIn('user')
    renderApp('/admin/users')
    await vi.waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    expect(screen.queryByRole('link', { name: /Admin/ })).toBeNull()
    expect(calls).not.toContain('GET /admin/users')
  })

  it('lets a superuser in, with a way back to their own ledger', async () => {
    signIn('superuser')
    renderApp('/admin')
    expect(await screen.findByText('2 account requests waiting for approval')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /My ledger/ })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /My ledger/ }))
    await vi.waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
  })

  it('shows how many ledgers there are and how much space they use', async () => {
    signIn('superuser')
    renderApp('/admin')
    expect(await screen.findByText('Ledger storage')).toBeInTheDocument()
    expect(screen.getByText('3 · 3.0 MB')).toBeInTheDocument()
  })

  it('offers the Admin button in the ledger top bar to superusers only', async () => {
    signIn('superuser')
    renderApp('/dashboard')
    expect(await screen.findByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/admin')
  })

  it('has no Admin area in demo mode', async () => {
    handlers['GET /meta'] = () => ({ json: { appName: 'Monetary', tagline: 't', version: '0.5.0', apiVersion: 'v0.5', demo: true } })
    signIn('superuser')
    renderApp('/admin')
    await vi.waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
  })
})

describe('pending requests', () => {
  beforeEach(() => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ status: 'pending_approval' })]) })
  })

  it('approves a request', async () => {
    handlers['POST /admin/users/5/approve'] = () => ({ json: user() })
    signIn('superuser')
    renderApp('/admin/pending')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Approve' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/5/approve'))
    expect(await screen.findByText('Ravi Kumar approved.')).toBeInTheDocument()
  })

  it('rejects a request with a reason', async () => {
    handlers['POST /admin/users/5/reject'] = () => ({ json: user({ status: 'rejected' }) })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/pending')
    await ui.click(await screen.findByRole('button', { name: 'Reject' }))
    await ui.type(await screen.findByLabelText(/Reason/), 'Unknown applicant')
    await ui.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reject' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/5/reject'))
    expect(JSON.parse(String(bodies['POST /admin/users/5/reject']))).toEqual({ reason: 'Unknown applicant' })
  })

  it('shows an empty state when nobody is waiting', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([]) })
    signIn('superuser')
    renderApp('/admin/pending')
    expect(await screen.findByText('No pending requests')).toBeInTheDocument()
  })
})

describe('users', () => {
  it('creates a user and shows the temporary password once', async () => {
    handlers['POST /admin/users'] = () => ({
      status: 201, json: { user: user({ id: 9, email: 'sam@example.com', name: 'Sam', mustChangePassword: true }), temporaryPassword: 'Temp-Pass-9xQ' },  // pragma: allowlist secret
    })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: /Create user/ }))
    await ui.type(screen.getByLabelText('Full name'), 'Sam')
    await ui.type(screen.getByLabelText('Email'), 'sam@example.com')
    await ui.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create user' }))
    expect(await screen.findByTestId('temporary-password')).toHaveTextContent('Temp-Pass-9xQ')  // pragma: allowlist secret
    expect(JSON.parse(String(bodies['POST /admin/users']))).toMatchObject({ name: 'Sam', email: 'sam@example.com', role: 'user' })
    await ui.click(screen.getByRole('button', { name: 'I have passed it on' }))
    expect(screen.queryByTestId('temporary-password')).toBeNull()
  })

  it('validates the new user before sending', async () => {
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: /Create user/ }))
    await ui.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create user' }))
    expect(await screen.findByText("Enter the person's name.")).toBeInTheDocument()
    expect(calls).not.toContain('POST /admin/users')
  })

  it('searches and filters on the server', async () => {
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await ui.type(await screen.findByLabelText('Search users'), 'rav')
    await vi.waitFor(() => expect(urls['GET /admin/users'].searchParams.get('q')).toBe('rav'))
  })

  it('resets a password and shows the new one once', async () => {
    handlers['POST /admin/users/5/reset-password'] = () => ({ json: { user: user(), temporaryPassword: 'Fresh-Temp-77' } })  // pragma: allowlist secret
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: 'More actions for Ravi Kumar' }))
    await ui.click(await screen.findByRole('menuitem', { name: 'Reset password…' }))
    await ui.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByTestId('temporary-password')).toHaveTextContent('Fresh-Temp-77')  // pragma: allowlist secret
  })

  it('suspends with a reason, and reports a server refusal instead of failing silently', async () => {
    handlers['POST /admin/users/5/suspend'] = () => ({ status: 409, json: { detail: 'Cannot suspend the last active superuser.', error_type: 'ConflictError' } })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: 'More actions for Ravi Kumar' }))
    await ui.click(await screen.findByRole('menuitem', { name: 'Suspend…' }))
    await ui.type(await screen.findByLabelText(/Reason/), 'abuse')
    await ui.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Suspend' }))
    expect(await screen.findByText('Cannot suspend the last active superuser.')).toBeInTheDocument()
    expect(JSON.parse(String(bodies['POST /admin/users/5/suspend']))).toEqual({ reason: 'abuse' })
  })

  it('does not offer to suspend or delete yourself', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ id: 1, name: 'Admin', email: 'admin@example.com', role: 'superuser' })]) })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: 'More actions for Admin' }))
    expect(await screen.findByRole('menuitem', { name: 'Reset password…' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Suspend…' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Delete…' })).toBeNull()
  })

  it('offers Restore for an account scheduled for deletion', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ status: 'pending_delete' })]) })
    handlers['POST /admin/users/5/restore'] = () => ({ json: user() })
    signIn('superuser')
    renderApp('/admin/users')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Restore' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/5/restore'))
  })
})

describe('audit log', () => {
  it('lists actions with people named, and the detail as plain text', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ id: 1, name: 'Admin', email: 'admin@example.com' }), user()]) })
    signIn('superuser')
    renderApp('/admin/audit')
    expect(await screen.findByText(/Admin \(admin@example.com\) approved an account: Ravi Kumar/)).toBeInTheDocument()
    expect(screen.getByText(/reason: ok/)).toBeInTheDocument()
  })
})

describe('sign-in locks and rejected requests', () => {
  it('shows a lock and lifts it with Unlock', async () => {
    const until = new Date(Date.now() + 10 * 60_000).toISOString()
    handlers['GET /admin/users'] = () => ({ json: page([user({ lockedUntil: until })]) })
    handlers['POST /admin/users/5/unlock'] = () => ({ json: user() })
    signIn('superuser')
    renderApp('/admin/users')
    expect(await screen.findByText('locked')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Unlock' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/5/unlock'))
    expect(await screen.findByText('Ravi Kumar unlocked.')).toBeInTheDocument()
  })

  it('does not offer Unlock once the lock has run out', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    handlers['GET /admin/users'] = () => ({ json: page([user({ lockedUntil: past })]) })
    signIn('superuser')
    renderApp('/admin/users')
    await screen.findByText('Ravi Kumar')
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull()
    expect(screen.queryByText('locked')).toBeNull()
  })

  it('reopens a rejected request', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ status: 'rejected' })]) })
    handlers['POST /admin/users/5/reopen'] = () => ({ json: user({ status: 'pending_approval' }) })
    signIn('superuser')
    renderApp('/admin/users')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reopen' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/5/reopen'))
    expect(await screen.findByText("Ravi Kumar's request is pending again.")).toBeInTheDocument()
  })
})
