/** Taking your own data with you: the export is fetched with the session token and saved as a file. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { authService } from '@/lib/api/services/authService'

describe('downloadMyData', () => {
  beforeEach(() => {
    localStorage.setItem('emx_token', 'ets_token')
    URL.createObjectURL = vi.fn(() => 'blob:ledger')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('sends the bearer token and saves the file under the server-chosen name', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('SQLite format 3', {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="ledger-2026-11-18.db"' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const clicked: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    })

    const name = await authService.downloadMyData()

    expect(name).toBe('ledger-2026-11-18.db')
    expect(clicked).toEqual(['ledger-2026-11-18.db'])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/me/export')
    expect(JSON.stringify(init.headers)).toContain('ets_token')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ledger')
    click.mockRestore()
  })

  it('surfaces a server error instead of saving anything', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'This action is disabled in demo mode.', error_type: 'X' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      }),
    ))
    await expect(authService.downloadMyData()).rejects.toThrow()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
