import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'
import { isTypingTarget, GO_TO, SHORTCUTS } from '@/lib/shortcuts'

const spies = () => ({ onAddTransaction: vi.fn(), onSearch: vi.fn(), onHelp: vi.fn(), onToggleTheme: vi.fn() })

function Harness({ h }: { h: ReturnType<typeof spies> }) {
  useGlobalShortcuts(h)
  const { pathname } = useLocation()
  return <div><span data-testid="path">{pathname}</span><input aria-label="field" /></div>
}
const setup = () => { const h = spies(); render(<MemoryRouter initialEntries={['/dashboard']}><Harness h={h} /></MemoryRouter>); return h }

describe('global shortcuts', () => {
  it('runs the single-key actions', () => {
    const h = setup()
    fireEvent.keyDown(window, { key: 'n' })
    fireEvent.keyDown(window, { key: '/' })
    fireEvent.keyDown(window, { key: '?' })
    fireEvent.keyDown(window, { key: 'D', shiftKey: true })
    expect(h.onAddTransaction).toHaveBeenCalledTimes(1)
    expect(h.onSearch).toHaveBeenCalledTimes(1)
    expect(h.onHelp).toHaveBeenCalledTimes(1)
    expect(h.onToggleTheme).toHaveBeenCalledTimes(1)
  })

  it('goes to a page with g then a letter, and ignores a letter without g', () => {
    setup()
    fireEvent.keyDown(window, { key: 't' })
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard')
    fireEvent.keyDown(window, { key: 'g' })
    fireEvent.keyDown(window, { key: 'r' })
    expect(screen.getByTestId('path')).toHaveTextContent('/reports')
  })

  it('opens search with Ctrl+K, even from a field', () => {
    const h = setup()
    screen.getByLabelText('field').focus()
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'k', ctrlKey: true })
    expect(h.onSearch).toHaveBeenCalledTimes(1)
  })

  it('does nothing while typing in a field or when a dialog is open', () => {
    const h = setup()
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'n' })
    expect(h.onAddTransaction).not.toHaveBeenCalled()
    const dlg = document.createElement('div'); dlg.setAttribute('role', 'dialog'); document.body.appendChild(dlg)
    fireEvent.keyDown(window, { key: 'n' })
    expect(h.onAddTransaction).not.toHaveBeenCalled()
    dlg.remove()
  })

  it('lists every go-to key in the help and tells typing targets apart', () => {
    const listed = SHORTCUTS.find((g) => g.group.startsWith('Go to'))!.items.map((i) => i.keys[1])
    expect(listed.sort()).toEqual(Object.keys(GO_TO).sort())
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
  })
})
