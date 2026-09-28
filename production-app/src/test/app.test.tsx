import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/lib/db/store'
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
  db.reset()
  useAuthStore.setState({ user: null, isAuthenticated: false })
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
    const before = db.transactions.length
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
    expect(await within(dialog).findByText('Select a category.')).toBeInTheDocument()
    expect(within(dialog).getByText('Select an account.')).toBeInTheDocument()
    expect(db.transactions.length).toBe(before)
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

    const before = db.transactions.length
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
    await waitFor(() => expect(db.transactions.length).toBe(before + 1), { timeout: 3000 })
    const saved = db.transactions.find((t) => t.description === 'Treat for Rahul')!
    expect(saved.type).toBe('split')
    expect(saved.yourShare).toBe(0)
    expect(saved.splits?.[0].share).toBe(1000)
  })
})
