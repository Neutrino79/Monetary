/**
 * The real React app against the real backend (fresh database).
 * Covers first-run setup -> dashboard, the "already set up" rule, a UI-created
 * transaction showing up in the list, and logout. Runs first; later files reuse the owner.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { accountsService } from '@/lib/api/services/accountsService'
import { OWNER } from './fixtures'
import { selectLabel, selectValue } from '../helpers'

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

beforeAll(() => {
  localStorage.clear()
  queryClient.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, isHydrating: false })
})

describe('first run', () => {
  it('redirects a visitor to setup, creates the owner, and lands on the dashboard under the backend-configured name', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    expect(await screen.findByText('Set up your ledger')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/signup')
    await screen.findByText(/first pet/i) // security questions come from the backend

    await user.type(screen.getByLabelText('Full name'), OWNER.name)
    await user.type(screen.getByLabelText('Email'), OWNER.email)
    await user.type(screen.getByLabelText('Password'), OWNER.password)
    await user.type(screen.getByLabelText('Confirm password'), OWNER.password)
    await selectValue(user, screen.getByLabelText('Timezone'), 'UTC')
    await user.type(screen.getByLabelText('Your answer'), OWNER.answer)
    await user.click(screen.getByRole('button', { name: 'Create owner account' }))

    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'), { timeout: 15_000 })
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()   // a new ledger gets the welcome card, not empty charts
    expect(useAuthStore.getState().user?.email).toBe(OWNER.email)
    expect(document.title).toContain('Monetary')
  })

  it('uses the default categories and income sources that setup seeded', async () => {
    const { categoriesService } = await import('@/lib/api/services/categoriesService')
    const expense = await categoriesService.list('EXPENSE')
    const income = await categoriesService.list('INCOME')
    expect(expense.map((c) => c.name)).toEqual(expect.arrayContaining(['Food & Dining', 'Groceries', 'Transport']))
    expect(income.map((c) => c.name)).toEqual(expect.arrayContaining(['Salary', 'Freelance']))
    expect(expense.find((c) => c.name === 'Groceries')?.parentId).toBe(expense.find((c) => c.name === 'Food & Dining')?.id)
  })
})

describe('adding a transaction through the UI', () => {
  it('creates an expense via the form and the new row appears in the list without a reload', async () => {
    await accountsService.create({ name: 'Main Bank', accountType: 'ASSET', subtype: 'bank', currency: 'INR', openingBalance: 1000 })
    // created behind the app's back (not through a mutation hook), so refresh its cache like a reload would
    await queryClient.invalidateQueries()
    const user = userEvent.setup()
    renderApp('/expenses')
    await user.click(await screen.findByRole('button', { name: /Add expense/i }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Description'), 'Coffee beans')
    await selectLabel(user, within(dialog).getByLabelText('Category'), /Groceries/)
    await selectLabel(user, within(dialog).getByLabelText('Pay from'), 'Main Bank')
    await user.type(within(dialog).getByPlaceholderText('0.00'), '12.50')
    await user.click(within(dialog).getByRole('button', { name: /Add|Save/ }))

    expect(await screen.findByText('Coffee beans', undefined, { timeout: 10_000 })).toBeInTheDocument()
    const accounts = await accountsService.list()
    expect(accounts.find((a) => a.name === 'Main Bank')?.balance).toBe(987.5) // computed by the backend
  })

  it('shows the server\'s validation message when the backend rejects a split that does not add up', async () => {
    const { friendsService } = await import('@/lib/api/services/friendsService')
    await friendsService.create({ name: 'Rahul', email: 'rahul@example.com' })
    const { transactionsService } = await import('@/lib/api/services/transactionsService')
    const accounts = await accountsService.list()
    const { categoriesService } = await import('@/lib/api/services/categoriesService')
    const cat = (await categoriesService.list('EXPENSE'))[0]!
    const friend = (await friendsService.list())[0]!
    await expect(
      transactionsService.create({
        type: 'split', description: 'Bad split', date: new Date().toISOString().slice(0, 10), amount: 100,
        accountId: accounts[0]!.id, categoryId: cat.id, yourShare: 10, splits: [{ friendId: friend.id, share: 50 }],
      }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('add up') })
  })
})

describe('already set up, and logging out', () => {
  it('a second visit to setup is refused with a pointer to sign-in / password reset', async () => {
    await useAuthStore.getState().logout()
    renderApp('/signup')
    expect(await screen.findByText('Monetary is already set up')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument()
  })

  it('refuses a direct POST /setup/init too (409), so the UI check is a convenience, not the lock', async () => {
    const { http } = await import('@/lib/api/http')
    await expect(
      http.post('/setup/init', {
        name: 'Mallory', email: 'mallory@example.com', password: 'another-password', currency: 'INR',
        securityQuestionId: 1, securityAnswer: 'x',
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
