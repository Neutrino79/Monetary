import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TagPicker } from '@/components/ui/TagPicker'
import { TagManager } from '@/components/domain/TagManager'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { normaliseTag, MAX_TAGS } from '@/lib/utils/tags'

describe('normaliseTag', () => {
  it('normalises like the server', () => {
    expect(normaliseTag('  #Goa   Trip ')).toBe('goa trip')
  })
})

function Harness({ initial = [] as string[], created = [] as string[] }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <TagPicker value={v} onChange={setV} options={['work', 'goa trip', 'office']} onCreate={async (n) => { created.push(n); return n }} />
      <output>{v.join('|')}</output>
    </>
  )
}

describe('TagPicker', () => {
  it('opens a dropdown of your tags and ticks several', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveTextContent('Select tags')
    await user.click(screen.getByRole('button', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'work' }))
    await user.click(screen.getByRole('option', { name: 'goa trip' }))
    expect(screen.getByRole('status')).toHaveTextContent('work|goa trip')
    expect(screen.getByRole('option', { name: 'work' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('option', { name: 'work' }))                     // untick
    expect(screen.getByRole('status')).toHaveTextContent(/^goa trip$/)
  })

  it('searches the list', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Tags' }))
    await user.type(await screen.findByLabelText('Search tags'), 'of')
    expect(screen.getByRole('option', { name: 'office' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'work' })).not.toBeInTheDocument()
  })

  it('offers an explicit create row only when nothing matches exactly, and selects the new tag', async () => {
    const created: string[] = []
    const user = userEvent.setup()
    render(<Harness created={created} />)
    await user.click(screen.getByRole('button', { name: 'Tags' }))
    await user.type(await screen.findByLabelText('Search tags'), 'work')
    expect(screen.queryByRole('button', { name: /Create tag/ })).not.toBeInTheDocument()   // it exists already
    await user.clear(screen.getByLabelText('Search tags'))
    await user.type(screen.getByLabelText('Search tags'), '  #Birthday ')
    await user.click(await screen.findByRole('button', { name: /Create tag .birthday./ }))
    await waitFor(() => expect(created).toEqual(['birthday']))
    expect(screen.getByRole('status')).toHaveTextContent('birthday')
  })

  it('does not allow more than the limit', async () => {
    const user = userEvent.setup()
    render(<Harness initial={Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`)} />)
    await user.click(screen.getByRole('button', { name: 'Tags' }))
    expect(await screen.findByRole('option', { name: 'work' })).toBeDisabled()
  })
})

describe('TagManager', () => {
  let calls: { method: string; path: string; body?: unknown }[]
  beforeEach(() => {
    calls = []
    localStorage.setItem('emx_token', 'ets_test')
    queryClient.clear()
    useAuthStore.setState({ user: { id: 1, name: 'A', email: 'a@x.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR', ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x' }, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v0\.5/, '')
      const method = init?.method ?? 'GET'
      if (method !== 'GET') calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const body = method === 'GET' ? [{ id: 1, name: 'work', uses: 4 }, { id: 2, name: 'goa trip', uses: 1 }] : { id: 1, name: 'x', uses: 0 }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const renderManager = () =>
    render(<QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter><TagManager /></MemoryRouter></ToastProvider></QueryClientProvider>)

  it('lists tags with their use counts and links each to its transactions', async () => {
    renderManager()
    const link = await screen.findByRole('link', { name: /work/ })
    expect(link).toHaveTextContent('4 transactions')
    expect(link).toHaveAttribute('href', '/transactions?tag=work')
    expect(screen.getByRole('link', { name: /goa trip/ })).toHaveTextContent('1 transaction')
  })

  it('adds a tag, and will not add one that exists', async () => {
    const user = userEvent.setup()
    renderManager()
    await screen.findByRole('link', { name: /work/ })
    await user.type(screen.getByLabelText('New tag'), 'Work')
    expect(screen.getByText('That tag already exists.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled()
    await user.clear(screen.getByLabelText('New tag'))
    await user.type(screen.getByLabelText('New tag'), '  Birthday ')
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ method: 'POST', path: '/tags', body: { name: 'birthday' } })
  })

  it('renames a tag', async () => {
    const user = userEvent.setup()
    renderManager()
    await user.click(await screen.findByRole('button', { name: 'Rename work' }))
    const box = screen.getByLabelText('New name for work')
    await user.clear(box)
    await user.type(box, 'office')
    await user.click(screen.getByRole('button', { name: 'Save tag name' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/tags/1', body: { name: 'office' } })
  })

  it('deletes a tag after confirming', async () => {
    const user = userEvent.setup()
    renderManager()
    await user.click(await screen.findByRole('button', { name: 'Delete goa trip' }))
    await user.click(await screen.findByRole('button', { name: 'Delete tag' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/tags/2' })
  })
})

describe('Categories & tags page', () => {
  it('opens on the Tags tab from the link and moves back to Categories', async () => {
    localStorage.setItem('emx_token', 'ets_test')
    queryClient.clear()
    useAuthStore.setState({ user: { id: 1, name: 'A', email: 'a@x.com', isSuperuser: true, timezone: 'UTC', homeCurrencyCode: 'INR', ledgerMode: 'DIRECT', securityQuestionId: 1, createdAt: 'x', updatedAt: 'x' }, isAuthenticated: true, isHydrating: false, hydrateError: null, sessionExpired: false })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v0\.5/, '')
      const body = path === '/tags' ? [{ id: 1, name: 'work', uses: 4 }] : path.startsWith('/reports/dashboard') ? { year: 2026, month: 10, netWorth: [], summary: [], accountBalances: [], budgetStatus: [], topSpending: [], incomeSummary: [], friendBalances: [], friendTotals: [] } : []
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const user = userEvent.setup()
    render(<QueryClientProvider client={queryClient}><ToastProvider><MemoryRouter initialEntries={['/categories?tab=tags']}><CategoriesPage /></MemoryRouter></ToastProvider></QueryClientProvider>)
    expect(await screen.findByLabelText('New tag')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Categories' }))
    expect(await screen.findByRole('button', { name: /Add category/ })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
