import { describe, it, expect, afterEach, vi } from 'vitest'
import { applyTheme } from '@/lib/utils/themeTransition'

const root = document.documentElement
const calm = (reduce: boolean) => vi.stubGlobal('matchMedia', () => ({ matches: reduce }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  root.removeAttribute('data-theme')
  root.classList.remove('theme-fade')
  delete (document as { startViewTransition?: unknown }).startViewTransition
})

describe('applyTheme', () => {
  it('sets the theme at once when not animating (first paint)', () => {
    calm(false)
    applyTheme('dark', false)
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.classList.contains('theme-fade')).toBe(false)
  })

  it('switches instantly for people who asked for reduced motion', () => {
    calm(true)
    root.setAttribute('data-theme', 'light')
    const start = vi.fn()
    ;(document as { startViewTransition?: unknown }).startViewTransition = start
    applyTheme('dark', true)
    expect(start).not.toHaveBeenCalled()
    expect(root.getAttribute('data-theme')).toBe('dark')
  })

  it('uses a view transition when the browser has one', () => {
    calm(false)
    root.setAttribute('data-theme', 'light')
    const start = vi.fn((update: () => void) => update())
    ;(document as { startViewTransition?: unknown }).startViewTransition = start
    applyTheme('dark', true)
    expect(start).toHaveBeenCalledTimes(1)
    expect(root.getAttribute('data-theme')).toBe('dark')
  })

  it('falls back to a short colour fade, then removes it', () => {
    vi.useFakeTimers()
    calm(false)
    root.setAttribute('data-theme', 'light')
    applyTheme('dark', true)
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.classList.contains('theme-fade')).toBe(true)
    vi.advanceTimersByTime(400)
    expect(root.classList.contains('theme-fade')).toBe(false)
  })
})
