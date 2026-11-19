/** The browser side of the captcha: solving the built-in proof of work and picking the right provider. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash, webcrypto } from 'node:crypto'
import { captchaHeaders, solveChallenge } from '@/lib/api/captcha'

const salt = 'salt123?expires=9999999999'
const hashOf = (n: number) => createHash('sha256').update(`${salt}${n}`).digest('hex')
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('solveChallenge', () => {
  it('finds the hidden number and packs the answer for the server', async () => {
    const payload = await solveChallenge({ algorithm: 'SHA-256', challenge: hashOf(2345), salt, maxnumber: 3000, signature: 'sig' })
    expect(JSON.parse(atob(payload))).toEqual({ algorithm: 'SHA-256', challenge: hashOf(2345), number: 2345, salt, signature: 'sig' })
  })

  it('gives up with a clear message when nothing in range matches', async () => {
    await expect(solveChallenge({ algorithm: 'SHA-256', challenge: 'nope', salt, maxnumber: 20, signature: 's' }))
      .rejects.toThrow(/security check/)
  })
})

describe('captchaHeaders', () => {
  it('is empty when the server has the captcha off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ provider: 'none', challenge: null, siteKey: null })))
    expect(await captchaHeaders()).toEqual({})
  })

  it('carries the solution of the built-in challenge in X-Captcha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      provider: 'altcha', siteKey: null, challenge: { algorithm: 'SHA-256', challenge: hashOf(5), salt, maxnumber: 10, signature: 'sig' },
    })))
    const headers = await captchaHeaders()
    expect(JSON.parse(atob(headers['X-Captcha'])).number).toBe(5)
  })

  it('runs the Turnstile widget and passes its token on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ provider: 'turnstile', challenge: null, siteKey: 'site-key' })))
    const rendered: Record<string, unknown>[] = []
    ;(window as unknown as { turnstile: unknown }).turnstile = {
      render: (_el: HTMLElement, opts: Record<string, unknown>) => { rendered.push(opts); queueMicrotask(() => (opts.callback as (t: string) => void)('cf-token')); return 'w1' },
      remove: vi.fn(),
    }
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation(((tag: HTMLScriptElement) => { queueMicrotask(() => tag.onload?.(new Event('load'))); return tag }) as never)
    expect(await captchaHeaders()).toEqual({ 'X-Captcha': 'cf-token' })
    expect(rendered[0]).toMatchObject({ sitekey: 'site-key', appearance: 'interaction-only' })
    expect(append).toHaveBeenCalled()
    expect(document.body.querySelector('div[style*="fixed"]')).toBeNull() // the holder is cleaned up
  })
})
