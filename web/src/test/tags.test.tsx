import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TagInput } from '@/components/ui/TagInput'
import { TagManager } from '@/components/domain/TagManager'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { addTag, normaliseTag, MAX_TAGS } from '@/lib/utils/tags'

describe('tag helpers', () => {
  it('normalises like the server', () => {
    expect(normaliseTag('  #Goa   Trip ')).toBe('goa trip')
  })
  it('ignores blanks, duplicates and anything past the limits', () => {
    expect(addTag(['a'], 'A')).toEqual(['a'])
    expect(addTag(['a'], '   ')).toEqual(['a'])
    expect(addTag([], 'x'.repeat(31))).toEqual([])
    expect(addTag(Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`), 'one more')).toHaveLength(MAX_TAGS)
    expect(addTag(['a'], 'b')).toEqual(['a', 'b'])
  })
})

function Harness({ initial = [] as string[] }) {
  const [v, setV] = useState(initial)
  return <><TagInput value={v} onChange={setV} suggestions={['work', 'goa trip']} /><output>{v.join('|')}</output></>
}

describe('TagInput', () => {
  it('adds on Enter or comma, removes with the chip button or Backspace', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const box = screen.getByLabelText('Add a tag')
    await user.type(box, 'one{enter}two,')
    expect(screen.getByRole('status')).toHaveTextContent('one|two')
    await user.click(screen.getByRole('button', { name: 'Remove tag one' }))
    expect(screen.getByRole('status')).toHaveTextContent(/^two$/)
    await user.type(screen.getByLabelText('Add a tag'), '{backspace}')
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
  it('offers existing tags that match what is typed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Add a tag'), 'go')
    expect(screen.getByRole('button', { name: '+ goa trip' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ work' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ goa trip' }))
    expect(screen.getByRole('status')).toHaveTextContent('goa trip')
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
