import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionBanner } from '@/components/layout/ConnectionBanner'
import { ApiError } from '@/lib/api/errors'
import { http } from '@/lib/api/http'
import { reportDeviceNetwork, reportProblem, reportReachable, retryDelayMs, useConnectionStore } from '@/lib/api/connection'
import { shouldRetryQuery } from '@/lib/queryClient'

const reset = () =>
  useConnectionStore.setState({ status: 'online', attempt: 0, nextRetryAt: null, checking: false, recovered: false })
const status = () => useConnectionStore.getState().status
const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } })

beforeEach(reset)
afterEach(() => {
  vi.unstubAllGlobals()
  reset()
})

describe('connection state', () => {
  it('moves between online, unreachable and server_error, and back when the server answers', () => {
    reportProblem('network')
    expect(status()).toBe('unreachable')
    reportProblem('server')
    expect(status()).toBe('server_error')
    reportReachable()
    expect(status()).toBe('online')
    expect(useConnectionStore.getState().recovered).toBe(true)
  })

  it('says offline when the device has no network, and re-checks when it returns', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    reportDeviceNetwork(false)
    expect(status()).toBe('offline')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    reportDeviceNetwork(true)
    expect(status()).toBe('unreachable') // the network is back, but the server has not answered yet
    vi.restoreAllMocks()
  })

  it('waits longer after every failed check, up to a limit', () => {
    expect([0, 1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([3000, 6000, 12000, 24000, 30000, 30000])
  })

  it('retries reads for temporary failures only', () => {
    expect(shouldRetryQuery(0, new ApiError('x', 0, 'NETWORK'))).toBe(true)
    expect(shouldRetryQuery(0, new ApiError('x', 503))).toBe(true)
    expect(shouldRetryQuery(0, new ApiError('x', 404))).toBe(false)
    expect(shouldRetryQuery(0, new ApiError('x', 401))).toBe(false)
    expect(shouldRetryQuery(2, new ApiError('x', 503))).toBe(false)
  })
})

describe('http client reports the connection', () => {
  it('marks the server unreachable when the request cannot be sent, and online after any answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(http.get('/x')).rejects.toMatchObject({ code: 'NETWORK' })
    expect(status()).toBe('unreachable')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'nope' }, 404)))
    await expect(http.get('/x')).rejects.toBeInstanceOf(ApiError)
    expect(status()).toBe('online') // a 404 still proves the server is there
  })

  it('treats a gateway 503 as the server being unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'down' }, 503)))
    await expect(http.get('/x')).rejects.toBeInstanceOf(ApiError)
    expect(status()).toBe('server_error')
  })

  it('does not blame the connection for an ordinary application error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'bad' }, 422)))
    await expect(http.get('/x')).rejects.toBeInstanceOf(ApiError)
    expect(status()).toBe('online')
  })
})

describe('connection banner', () => {
  const view = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ConnectionBanner />
      </QueryClientProvider>,
    )

  it('shows nothing while everything works', () => {
    view()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('explains each kind of problem and offers a retry', async () => {
    view()
    reportProblem('network')
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(screen.getByRole('alert')).toHaveTextContent(/Trying again in \d+s/)
    reportProblem('server')
    expect(await screen.findByText('The server is temporarily unavailable')).toBeInTheDocument()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    reportDeviceNetwork(false)
    expect(await screen.findByText("You're offline")).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('Retry now checks the server and then says it is back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ name: 'Monetary' }))
    vi.stubGlobal('fetch', fetchMock)
    view()
    reportProblem('network')
    await userEvent.setup().click(await screen.findByRole('button', { name: /Retry now/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('Back online')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/meta$/)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps showing the problem when the retry fails too', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    view()
    reportProblem('network')
    await userEvent.setup().click(await screen.findByRole('button', { name: /Retry now/ }))
    await vi.waitFor(() => expect(useConnectionStore.getState().attempt).toBe(1))
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server")
  })
})
