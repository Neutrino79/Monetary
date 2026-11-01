import { describe, it, expect, beforeEach } from 'vitest'
import { ACCENTS, useUiStore } from '@/store/uiStore'

beforeEach(() => { localStorage.clear(); useUiStore.setState({ accent: 'green', density: 'comfortable' }) })

describe('appearance settings', () => {
  it('starts with the green accent and comfortable rows', () => {
    expect(useUiStore.getState().accent).toBe('green')
    expect(useUiStore.getState().density).toBe('comfortable')
  })

  it('stores a new accent and density and keeps them across reloads', () => {
    useUiStore.getState().setAccent('violet')
    useUiStore.getState().setDensity('compact')
    const saved = JSON.parse(localStorage.getItem('emx_ui')!).state
    expect(saved).toMatchObject({ accent: 'violet', density: 'compact' })
  })

  it('offers each accent once, with a swatch', () => {
    expect(new Set(ACCENTS.map((a) => a.value)).size).toBe(ACCENTS.length)
    expect(ACCENTS.every((a) => /^#[0-9a-f]{6}$/i.test(a.swatch))).toBe(true)
  })
})
