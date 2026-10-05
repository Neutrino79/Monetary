import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { mockDb } from '@/lib/api/mock/mockDb'
import { appConfig } from '@/config/app'

function renderApp(path = '/') {
  window.history.pushState({}, '', path)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

async function loginAsDemo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'ananya.kulkarni@example.com')
  await user.type(screen.getByLabelText('Password'), 'demo1234')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByText(/Good to see you, Ananya/, {}, { timeout: 4000 })
}

beforeEach(() => {
  localStorage.clear()
  mockDb.reset()
  useAuthStore.setState({ user: null, isAuthenticated: false, isHydrating: false })
})

describe('auth', () => {
  it('redirects unauthenticated users to login and shows configurable app name', async () => {
    renderApp('/dashboard')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByText(appConfig.name)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('shows an error for wrong credentials', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'nope@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/don't match any account/)).toBeInTheDocument()
  })

  it('logs in with demo credentials and lands on the dashboard', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await loginAsDemo(user)
    expect(window.location.pathname).toBe('/dashboard')
    expect(screen.getByText('Net worth')).toBeInTheDocument()
    expect(screen.getByText('Recent activity')).toBeInTheDocument()
  })

  it('renders signup and forgot-password pages', async () => {
    renderApp('/signup')
    expect(await screen.findByText('Create your account')).toBeInTheDocument()
  })
})

describe('transactions', () => {
  it('lists, searches and opens a detail drawer', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await loginAsDemo(user)

    await user.click(screen.getAllByRole('link', { name: /Transactions/ })[0])
    const search = await screen.findByPlaceholderText(/Search description/, {}, { timeout: 4000 })
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0))

    await user.type(search, 'Netflix')
    await waitFor(() => {
      const rows = document.querySelectorAll('tbody tr')
      expect(rows.length).toBeGreaterThan(0)
      rows.forEach((r) => expect(r.textContent).toContain('Netflix'))
    })

    await user.click(document.querySelector('tbody tr')!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Netflix Subscription')).toBeInTheDocument()
    expect(within(dialog).getByText('Record')).toBeInTheDocument()
  })

  it('does not autofill account/category — validation blocks an empty submit', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await loginAsDemo(user)

    await user.click(screen.getAllByRole('button', { name: /Add transaction/ })[0])
    const dialog = await screen.findByRole('dialog')
    const selects = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    selects.forEach((s) => expect(s.value).toBe(''))

    await user.type(within(dialog).getByLabelText('Description'), 'Coffee')
    const before = mockDb.transactions.length
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
    expect(await within(dialog).findByText('Select a category.')).toBeInTheDocument()
    expect(within(dialog).getByText('Select an account.')).toBeInTheDocument()
    expect(mockDb.transactions.length).toBe(before)
  })

  it('saves a split where the owner share is zero', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await loginAsDemo(user)

    await user.click(screen.getAllByRole('button', { name: /Add transaction/ })[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Split' }))

    await user.type(within(dialog).getByLabelText('Description'), 'Treat for Rahul')
    const [category, account] = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    await user.selectOptions(category, 'cat_food_restaurants')
    await user.selectOptions(account, 'acc_hdfc_sav')
    await user.type(within(dialog).getByPlaceholderText('0.00'), '1000')
    await user.click(within(dialog).getByLabelText('Rahul Sharma'))

    // your share -> 0, friend -> 1000
    const shareInputs = within(dialog).getAllByRole('spinbutton') as HTMLInputElement[]
    // spinbuttons: [amount, yourShare, friendShare]
    const yourShare = shareInputs[1]
    const friendShare = shareInputs[2]
    await user.clear(yourShare)
    await user.type(yourShare, '0')
    await user.clear(friendShare)
    await user.type(friendShare, '1000')

    const before = mockDb.transactions.length
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
    await waitFor(() => expect(mockDb.transactions.length).toBe(before + 1), { timeout: 3000 })
    const saved = mockDb.transactions.find((t) => t.description === 'Treat for Rahul')!
    expect(saved.type).toBe('split')
    expect(saved.yourShare).toBe(0)
    expect(saved.splits?.[0].share).toBe(1000)
  })
})

describe('new pages', () => {
  const PAGES: Array<[string, RegExp]> = [
    ['Income', /Income/],
    ['Expenses', /Expenses/],
    ['Transfers', /Transfers/],
    ['Splits', /Splits/],
    ['Friends', /Friends/],
    ['Accounts', /Accounts/],
    ['Categories', /Categories/],
    ['Reports & Trends', /Reports & Trends/],
    ['Settings', /Settings/],
  ]

  it.each(PAGES)('navigates to the %s page', async (linkName, heading) => {
    const user = userEvent.setup()
    renderApp('/login')
    await loginAsDemo(user)
    await user.click(screen.getAllByRole('link', { name: linkName })[0])
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('settles a friend from the Friends page', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await loginAsDemo(user)
    await user.click(screen.getAllByRole('link', { name: 'Friends' })[0])
    await screen.findByRole('heading', { name: /Friends/ })

    const settleButtons = await screen.findAllByRole('button', { name: /Settle up/ })
    const enabled = settleButtons.find((b) => !(b as HTMLButtonElement).disabled)!
    const before = mockDb.transactions.length
    await user.click(enabled)
    const dialog = await screen.findByRole('dialog')
    const [accountSelect] = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    await user.selectOptions(accountSelect, 'acc_hdfc_sav')
    await user.type(within(dialog).getByLabelText('Amount'), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Record settlement' }))
    await waitFor(() => expect(mockDb.transactions.length).toBe(before + 1), { timeout: 3000 })
  })

  it('archives and restores an account from the Accounts page', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await loginAsDemo(user)
    await user.click(screen.getAllByRole('link', { name: 'Accounts' })[0])
    await screen.findByRole('heading', { name: /Accounts/ })

    const activeBefore = mockDb.accounts.filter((a) => a.isActive).length
    await user.click((await screen.findAllByRole('button', { name: 'Archive account' }))[0])
    await user.click(await screen.findByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(mockDb.accounts.filter((a) => a.isActive).length).toBe(activeBefore - 1))

    const restoreButtons = await screen.findAllByRole('button', { name: /Restore/ })
    await user.click(restoreButtons[0])
    await waitFor(() => expect(mockDb.accounts.filter((a) => a.isActive).length).toBe(activeBefore))
  })

  it('adds a category with a budget', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await loginAsDemo(user)
    await user.click(screen.getAllByRole('link', { name: 'Categories' })[0])
    await screen.findByRole('heading', { name: /Categories/ })

    await user.click(screen.getByRole('button', { name: /Add category/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Category name'), 'Pets')
    await user.type(within(dialog).getByLabelText('Monthly budget (optional)'), '1500')
    const before = mockDb.categories.length
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))
    await waitFor(() => expect(mockDb.categories.length).toBe(before + 1))
    const saved = mockDb.categories.find((c) => c.name === 'Pets')!
    expect(saved.budgetLimit).toBe(1500)
  })
})
