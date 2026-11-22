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
  lockedUntil: null, passwordExpiresAt: null, rerequestCount: 0, approvedAt: null, approvedBy: null, createdAt: '2026-11-01T10:00:00+00:00', updatedAt: '2026-11-01T10:00:00+00:00', lastActivityAt: '2026-11-03T10:00:00+00:00', storageBytes: 2048, ...over,
})
const page = (items: unknown[]) => ({ items, total: items.length, limit: 50, offset: 0 })
const owner = {
  id: 1, name: 'Admin', email: 'admin@example.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR',
  ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x',
}

function signIn(role: 'user' | 'admin' | 'superuser') {
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
    expect(await screen.findByText('2 sign-up requests are waiting')).toBeInTheDocument()
    // Same shell as the ledger: admin navigation, and the profile menu is the one way back (no second link in the sidebar).
    const nav = within(screen.getByLabelText('Primary navigation'))
    expect(nav.getByRole('link', { name: /^Requests/ })).toHaveAttribute('href', '/admin/pending')
    expect(nav.queryByRole('link', { name: /My ledger/ })).toBeNull()
    const ui = userEvent.setup()
    await ui.click(screen.getByRole('button', { name: 'Account menu' }))
    await ui.click(within(await screen.findByRole('dialog')).getByRole('link', { name: /My ledger/ }))
    await vi.waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
  })

  it('shows how many ledgers there are and how much space they use', async () => {
    signIn('superuser')
    renderApp('/admin')
    expect(await screen.findByText('Ledger storage')).toBeInTheDocument()
    expect(screen.getByText('3 · 3.0 MB')).toBeInTheDocument()
  })

  it('reaches Administration from the profile menu, and no longer from the top bar', async () => {
    signIn('superuser')
    renderApp('/dashboard')
    const ui = userEvent.setup()
    await ui.click(await screen.findByRole('button', { name: 'Account menu' }))
    expect(await screen.findByRole('link', { name: /Administration/ })).toHaveAttribute('href', '/admin')
    expect(screen.queryByRole('link', { name: /^Admin$/ })).toBeNull()
  })

  it('offers regular users no Administration entry', async () => {
    signIn('user')
    renderApp('/dashboard')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Account menu' }))
    expect(await screen.findByRole('button', { name: /Log out/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Administration/ })).toBeNull()
  })

  it('has no Admin area in demo mode', async () => {
    handlers['GET /meta'] = () => ({ json: { appName: 'Monetary', tagline: 't', version: '0.5.0', apiVersion: 'v0.5', demo: true } })
    signIn('superuser')
    renderApp('/admin')
    await vi.waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
  })
})

describe('the Platform page and the audit export', () => {
  const platform = {
    version: '0.5.0', apiVersion: 'v0.5', environment: 'production', demoMode: false, controlDbBytes: 2097152, ledgerCount: 3, ledgerBytes: 3145728,
    settings: [{ key: 'MONETARY_LOGIN_MAX_FAILURES', label: 'Failed sign-ins before a lock', value: '5' }],
  }

  it('shows the superuser the installation and its read-only settings', async () => {
    handlers['GET /admin/platform'] = () => ({ json: platform })
    signIn('superuser')
    renderApp('/admin/platform')
    expect(await screen.findByText('Failed sign-ins before a lock')).toBeInTheDocument()
    expect(screen.getByText('production')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Primary navigation')).getByRole('link', { name: /Platform/ })).toBeInTheDocument()
  })

  it('keeps Platform away from an admin: no menu entry, and its address leads to the Overview', async () => {
    signIn('admin')
    renderApp('/admin/platform')
    await vi.waitFor(() => expect(window.location.pathname).toBe('/admin'))
    expect(within(screen.getByLabelText('Primary navigation')).queryByRole('link', { name: /Platform/ })).toBeNull()
    expect(calls).not.toContain('GET /admin/platform')
  })

  it('exports the audit log as a CSV file', async () => {
    handlers['GET /admin/audit-log/export'] = () => ({ json: {} })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    signIn('admin')
    renderApp('/admin/audit')
    await userEvent.setup().click(await screen.findByRole('button', { name: /Export CSV/ }))
    await vi.waitFor(() => expect(calls).toContain('GET /admin/audit-log/export'))
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
    await ui.click(await screen.findByRole('button', { name: 'Reject…' }))
    await ui.click(await screen.findByRole('button', { name: 'Unknown person' }))
    await ui.type(screen.getByLabelText(/^Note/), 'Not in our records')
    await ui.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/5/reject'))
    expect(JSON.parse(String(bodies['POST /admin/users/5/reject']))).toEqual({ reason: 'Unknown person: Not in our records' })
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
    await ui.type(await screen.findByLabelText('Search'), 'rav')
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

  it('offers no account actions on your own row', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ id: 1, name: 'Admin', email: 'admin@example.com', role: 'superuser' })]) })
    signIn('superuser')
    renderApp('/admin/users')
    await screen.findByText('Admin')
    expect(screen.queryByRole('button', { name: 'More actions for Admin' })).toBeNull()
  })

  it('offers Restore for an account scheduled for deletion', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ status: 'pending_delete' })]) })
    handlers['POST /admin/users/5/restore'] = () => ({ json: user() })
    signIn('superuser')
    renderApp('/admin/users')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Restore' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/5/restore'))
    // Nothing else can be done to it, so there is no (empty) three-dot menu.
    expect(screen.queryByRole('button', { name: 'More actions for Ravi Kumar' })).toBeNull()
  })

  it('purges overdue accounts, or the chosen ones at once, from the Pending deletion tab', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ status: 'pending_delete', deleteAfter: '2020-01-01T00:00:00+00:00' }), user({ id: 6, email: 'sam@example.com', name: 'Sam Roy', status: 'pending_delete', deleteAfter: '2999-01-01T00:00:00+00:00' })]) })
    handlers['GET /admin/stats'] = () => ({ json: { totalUsers: 2, byStatus: { pending_delete: 2 }, pendingApproval: 0, activeSuperusers: 1, ledgerCount: 2, ledgerBytes: 1, overdueForPurge: 1 } })
    handlers['POST /admin/purge'] = () => ({ json: { purged: 1 } })
    handlers['POST /admin/purge-selected'] = () => ({ json: { purged: 1 } })
    signIn('superuser')
    renderApp('/admin/users')
    const u = userEvent.setup()
    await u.click(await screen.findByRole('tab', { name: /Pending deletion/ }))
    expect(await screen.findByText('Overdue for purge')).toBeInTheDocument()
    expect(screen.getByText(/Deletes in \d+ days/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Purge overdue (1)' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/purge'))
    await u.click(screen.getByRole('checkbox', { name: 'Select Sam Roy' }))
    await u.click(screen.getByRole('button', { name: 'Delete selected now…' }))
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete now' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/purge-selected'))
    expect(JSON.parse(String(bodies['POST /admin/purge-selected']))).toEqual({ userIds: [6] })
  })

  it('keeps purge buttons away from admins', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ status: 'pending_delete' })]) })
    signIn('admin')
    renderApp('/admin/users')
    await userEvent.setup().click(await screen.findByRole('tab', { name: /Pending deletion/ }))
    expect(screen.queryByRole('button', { name: /Purge overdue/ })).toBeNull()
  })
})

describe('account menu and settings', () => {
  it('puts the profile avatar in the top bar, with no profile box in the sidebar and no Add button', async () => {
    signIn('user')
    handlers['GET /accounts'] = () => ({ json: [] })
    renderApp('/settings')
    const menu = await screen.findByRole('button', { name: 'Account menu' })
    expect(within(screen.getByLabelText('Primary navigation')).queryByRole('button', { name: 'Account menu' })).toBeNull()
    expect(menu.closest('header')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
  })

  it('lists signed-in devices, marks this one and signs another out', async () => {
    const session = (over: Record<string, unknown>) => ({ id: 1, createdAt: '2026-11-01T10:00:00+00:00', expiresAt: '2026-12-01T10:00:00+00:00', lastSeenAt: '2026-11-02T10:00:00+00:00', ip: '10.0.0.1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36', current: false, ...over })
    handlers['GET /me/sessions'] = () => ({ json: [session({ id: 2 }), session({ id: 1, current: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/120.0' })] })
    handlers['GET /me/account'] = () => ({ json: { memberSince: '2026-01-01T00:00:00+00:00', lastLoginAt: null, ledgerBytes: 2048, securityQuestionId: 1, deleteGraceDays: 30 } })
    handlers['GET /auth/security-questions'] = () => ({ json: [{ id: 1, text: 'Q one?' }] })
    handlers['DELETE /me/sessions/2'] = () => ({ json: { detail: 'Signed out.' } })
    handlers['POST /me/sessions/revoke-others'] = () => ({ json: { ended: 1 } })
    signIn('user')
    renderApp('/settings')
    const devices = within(await screen.findByRole('list', { name: 'Signed-in devices' }))
    expect(devices.getByText('This device')).toBeInTheDocument()
    expect(devices.getByText('Firefox on Windows')).toBeInTheDocument()
    expect(devices.getByText('Chrome on macOS')).toBeInTheDocument()
    expect(devices.queryByRole('button', { name: /Sign out Firefox/ })).toBeNull() // no button on this device
    const u = userEvent.setup()
    await u.click(devices.getByRole('button', { name: 'Sign out Chrome on macOS 2' }))
    await vi.waitFor(() => expect(calls).toContain('DELETE /me/sessions/2'))
    await u.click(screen.getByRole('button', { name: 'Sign out other devices' }))
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign out others' }))
    await vi.waitFor(() => expect(calls).toContain('POST /me/sessions/revoke-others'))
  })

  const PW = 'secret-pass-1' // pragma: allowlist secret
  it('deletes my own account after confirming the password, except for the superuser', async () => {
    handlers['GET /me/sessions'] = () => ({ json: [] })
    handlers['GET /me/account'] = () => ({ json: { memberSince: '2026-01-01T00:00:00+00:00', lastLoginAt: null, ledgerBytes: null, securityQuestionId: null, deleteGraceDays: 30 } })
    handlers['GET /auth/security-questions'] = () => ({ json: [] })
    handlers['POST /me/delete'] = () => ({ json: { detail: 'ok' } })
    handlers['POST /auth/logout'] = () => ({ json: { detail: 'ok' } })
    signIn('user')
    const { unmount } = renderApp('/settings')
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Delete my account…' }))
    await u.type(screen.getByLabelText('Confirm with your password'), PW)
    await u.click(screen.getByRole('button', { name: 'Delete my account' }))
    await vi.waitFor(() => expect(calls).toContain('POST /me/delete'))
    expect(JSON.parse(String(bodies['POST /me/delete']))).toEqual({ password: PW })
    unmount()
    signIn('superuser')
    renderApp('/settings')
    await screen.findByRole('list', { name: 'Signed-in devices' }).catch(() => null)
    expect(screen.queryByRole('button', { name: 'Delete my account…' })).toBeNull()
  })
})

describe('audit log', () => {
  it('lists actions with people named, and the detail as plain text', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ id: 1, name: 'Admin', email: 'admin@example.com' }), user()]) })
    signIn('superuser')
    renderApp('/admin/audit')
    expect(await screen.findByText('approved an account')).toBeInTheDocument()
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument()
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
    expect(await screen.findByText('Locked')).toBeInTheDocument()
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
    renderApp('/admin/pending')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reopen' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/5/reopen'))
    expect(await screen.findByText("Ravi Kumar's request is pending again.")).toBeInTheDocument()
  })
})

describe('roles', () => {
  const rows = () => ({
    json: page([
      user({ id: 5, name: 'Ravi Kumar' }),
      user({ id: 6, name: 'Helen Admin', email: 'helen@example.com', role: 'admin' }),
      user({ id: 1, name: 'The Boss', email: 'boss@example.com', role: 'superuser' }),
    ]),
  })

  it('lets the superuser make admins and take it back, but never offers a second superuser', async () => {
    handlers['GET /admin/users'] = rows
    handlers['PUT /admin/users/5/role'] = () => ({ json: user({ role: 'admin' }) })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: 'More actions for Ravi Kumar' }))
    expect(screen.queryByRole('menuitem', { name: /superuser/i })).toBeNull()
    await ui.click(await screen.findByRole('menuitem', { name: 'Make admin…' }))
    await ui.click(await screen.findByRole('button', { name: 'Change role' }))
    await vi.waitFor(() => expect(calls).toContain('PUT /admin/users/5/role'))
    expect(JSON.parse(String(bodies['PUT /admin/users/5/role']))).toEqual({ role: 'admin' })
    await ui.keyboard('{Escape}')
    await ui.click(await screen.findByRole('button', { name: 'More actions for Helen Admin' }))
    expect(await screen.findByRole('menuitem', { name: 'Make regular user…' })).toBeInTheDocument()
  })

  it('gives an admin the everyday actions on users only', async () => {
    handlers['GET /admin/users'] = rows
    const ui = userEvent.setup()
    signIn('admin')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: 'More actions for Ravi Kumar' }))
    expect(await screen.findByRole('menuitem', { name: 'Suspend…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Reset password…' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete…' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Make /})).toBeNull()
    await ui.keyboard('{Escape}')
    // another admin and the superuser are out of reach
    expect(screen.queryByRole('button', { name: 'More actions for Helen Admin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More actions for The Boss' })).toBeNull()
  })

  it('shows each role next to its account', async () => {
    handlers['GET /admin/users'] = rows
    signIn('superuser')
    renderApp('/admin/users')
    await screen.findByText('Ravi Kumar')
    expect(screen.getByTestId('role-6')).toHaveTextContent('Admin')
    expect(screen.getByTestId('role-1')).toHaveTextContent('Superuser')
    expect(screen.getByTestId('role-5')).toHaveTextContent('User')
  })

  it('lets only the superuser choose a role when creating an account', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([]) })
    const ui = userEvent.setup()
    signIn('admin')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: /Create user/ }))
    await screen.findByLabelText('Email')
    expect(screen.queryByLabelText('Role')).toBeNull()
  })

  it('shows the superuser a role choice of user or admin', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([]) })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await ui.click(await screen.findByRole('button', { name: /Create user/ }))
    await ui.click(await screen.findByLabelText('Role'))
    expect(await screen.findByText('Admin', { selector: '[role="option"] *, [role="option"]' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Superuser' })).toBeNull()
  })

  it('opens the Admin area to an admin', async () => {
    handlers['GET /admin/stats'] = () => ({ json: { totalUsers: 1, byStatus: {}, pendingApproval: 0, activeSuperusers: 1, activeAdmins: 1, ledgerCount: 1, ledgerBytes: 1024 } })
    signIn('admin')
    renderApp('/admin')
    expect(await screen.findByText('Admins')).toBeInTheDocument()
  })
})

describe('managing one account and many', () => {
  it('shows the detail page with its sessions, and signs one device out', async () => {
    signIn('admin')
    handlers['GET /admin/users/5'] = () => ({ json: user() })
    handlers['GET /admin/users/5/sessions'] = () => ({ json: [{ id: 9, createdAt: '2026-11-03T10:00:00+00:00', expiresAt: '2026-12-03T10:00:00+00:00', lastSeenAt: null, ip: '9.9.9.9', userAgent: 'TestBrowser/1.0' }] })
    handlers['DELETE /admin/users/5/sessions/9'] = () => ({ json: { detail: 'Session revoked.' } })
    renderApp('/admin/users/5')
    expect(await screen.findByText('TestBrowser/1.0')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Sign out TestBrowser/ }))
    await vi.waitFor(() => expect(calls).toContain('DELETE /admin/users/5/sessions/9'))
  })

  it('saves profile changes, warning that a new email signs the person out', async () => {
    signIn('admin')
    handlers['GET /admin/users/5'] = () => ({ json: user() })
    handlers['GET /admin/users/5/sessions'] = () => ({ json: [] })
    handlers['PATCH /admin/users/5'] = () => ({ json: user({ name: 'Ravi K' }) })
    renderApp('/admin/users/5')
    const name = await screen.findByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Ravi K')
    await userEvent.type(screen.getByLabelText('Email'), 'x')
    expect(screen.getByText(/signs this person out/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(calls).toContain('PATCH /admin/users/5'))
    expect(JSON.parse(String(bodies['PATCH /admin/users/5']))).toMatchObject({ name: 'Ravi K' })
    expect(JSON.parse(String(bodies['PATCH /admin/users/5']))).not.toHaveProperty('timezone') // the ledger owns it
    expect(screen.getByLabelText('Time zone')).toBeDisabled()
  })

  it('runs a bulk action on the selected accounts and reports the skipped ones', async () => {
    signIn('admin')
    handlers['GET /admin/users'] = () => ({ json: page([user(), user({ id: 6, name: 'Sam', email: 'sam@example.com' })]) })
    handlers['POST /admin/users/bulk'] = () => ({ json: { action: 'suspend', succeeded: 1, failed: 1, results: [{ userId: 5, ok: true, error: null }, { userId: 6, ok: false, error: 'Cannot suspend an account that is suspended.' }] } })
    renderApp('/admin/users')
    await userEvent.click(await screen.findByLabelText('Select Ravi Kumar'))
    await userEvent.click(screen.getByLabelText('Select Sam'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', { name: 'Suspend' }))
    expect(await screen.findByText(/1 done, 1 skipped/)).toBeInTheDocument()
    expect(JSON.parse(String(bodies['POST /admin/users/bulk']))).toMatchObject({ action: 'suspend', userIds: [5, 6] })
  })

  it('offers the purge only to the superuser, behind a confirmation', async () => {
    handlers['GET /admin/stats'] = () => ({ json: { totalUsers: 4, byStatus: {}, pendingApproval: 0, activeSuperusers: 1, activeAdmins: 0, overdueForPurge: 2, ledgerCount: 3, ledgerBytes: 1 } })
    handlers['POST /admin/purge'] = () => ({ json: { purged: 2 } })
    signIn('admin')
    const first = renderApp('/admin')
    expect(await screen.findByText(/2 accounts are overdue for purge/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Purge now' })).toBeNull()
    first.unmount()
    signIn('superuser')
    renderApp('/admin')
    await userEvent.click(await screen.findByRole('button', { name: 'Purge now' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Purge now' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/purge'))
  })
})

describe('the redesigned admin pages', () => {
  const people = () => page([
    user({ id: 5, name: 'Ravi Kumar', storageBytes: 5 * 1024 * 1024 }),
    user({ id: 6, name: 'Helen Admin', email: 'helen@example.com', role: 'admin', storageBytes: 1024 }),
    user({ id: 7, name: 'Anika Joshi', email: 'anika@example.com', status: 'pending_approval', createdAt: '2026-10-01T10:00:00+00:00', storageBytes: null }),
  ])

  it('shows the overview with the oldest wait, status counts and the largest ledgers (sizes only)', async () => {
    handlers['GET /admin/users'] = () => ({ json: people() })
    signIn('superuser')
    renderApp('/admin')
    expect(await screen.findByText('Accounts by status')).toBeInTheDocument()
    expect(screen.getByText('Largest ledgers')).toBeInTheDocument()
    expect(await screen.findByText('5.0 MB')).toBeInTheDocument()
    expect(screen.getByText(/The oldest has waited/)).toBeInTheDocument()
  })

  it('lists accounts only (no requests), and filters them by role', async () => {
    handlers['GET /admin/users'] = () => ({ json: people() })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/users')
    await screen.findByText('Ravi Kumar')
    // sign-up requests are decided on the Requests page, so they are not in this list at all
    expect(screen.queryByText('Anika Joshi')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('tab', { name: /Pending(?! deletion)/ })).toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Filters' }))
    await ui.click(await screen.findByLabelText('Role'))
    await ui.click(await screen.findByRole('option', { name: 'Admins' }))
    expect(screen.queryByText('Ravi Kumar')).toBeNull()
    expect(screen.getByText('Helen Admin')).toBeInTheDocument()
  })

  it('creates a user from the top bar on any admin page', async () => {
    signIn('superuser')
    renderApp('/admin/audit')
    await userEvent.setup().click(await screen.findByRole('button', { name: /Create user/ }))
    expect(await screen.findByLabelText('Full name')).toBeInTheDocument()
  })

  it('approves several requests at once from the Requests page', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ id: 5, status: 'pending_approval' }), user({ id: 7, name: 'Anika Joshi', status: 'pending_approval' })]) })
    handlers['POST /admin/users/bulk'] = () => ({ json: { succeeded: 2, failed: 0, results: [] } })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/pending')
    await ui.click(await screen.findByLabelText(/select all/))
    await ui.click(screen.getByRole('button', { name: 'Approve selected' }))
    await vi.waitFor(() => expect(calls).toContain('POST /admin/users/bulk'))
    expect(JSON.parse(String(bodies['POST /admin/users/bulk']))).toMatchObject({ action: 'approve', userIds: [5, 7] })
  })

  it('shows the superuser the role and delete cards on an account, and an admin neither', async () => {
    handlers['GET /admin/users/5'] = () => ({ json: user() })
    handlers['GET /admin/users/5/sessions'] = () => ({ json: [] })
    handlers['GET /admin/audit-log'] = () => ({ json: page([]) })
    signIn('superuser')
    const view = renderApp('/admin/users/5')
    expect(await screen.findByRole('button', { name: 'Make admin…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete Ravi Kumar/ })).toBeInTheDocument()
    view.unmount()
    queryClient.clear()
    signIn('admin')
    renderApp('/admin/users/5')
    await screen.findByText('Account')
    expect(screen.queryByRole('button', { name: 'Make admin…' })).toBeNull()
  })

  it('filters the audit log by type', async () => {
    handlers['GET /admin/users'] = () => ({ json: page([user({ id: 1, name: 'Admin', email: 'admin@example.com' }), user()]) })
    handlers['GET /admin/audit-log'] = () => ({ json: page([
      { id: 1, at: new Date().toISOString(), actorUserId: 1, action: 'user.approve', targetUserId: 5, detail: null, ip: '1.1.1.1' },
      { id: 2, at: new Date().toISOString(), actorUserId: 1, action: 'user.delete', targetUserId: 5, detail: null, ip: '1.1.1.1' },
    ]) })
    const ui = userEvent.setup()
    signIn('superuser')
    renderApp('/admin/audit')
    expect(await screen.findByText('approved an account')).toBeInTheDocument()
    await ui.click(screen.getByRole('button', { name: 'Filters' }))
    await ui.click(await screen.findByLabelText('Action type'))
    await ui.click(await screen.findByRole('option', { name: 'Deletion' }))
    expect(screen.queryByText('approved an account')).toBeNull()
    expect(screen.getByText('scheduled an account for deletion')).toBeInTheDocument()
  })

  it('marks backups, export, role transfer and the integrity check as coming soon (disabled)', async () => {
    handlers['GET /admin/platform'] = () => ({ json: { version: '0.5.0', apiVersion: 'v0.5', environment: 'production', demoMode: false, controlDbBytes: 1024, ledgerCount: 1, ledgerBytes: 1024, settings: [] } })
    signIn('superuser')
    renderApp('/admin/platform')
    expect(await screen.findByText('Backups and exports')).toBeInTheDocument()
    expect(screen.getAllByText('Coming soon')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Back up all ledgers' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Transfer…' })).toBeDisabled()
  })
})
