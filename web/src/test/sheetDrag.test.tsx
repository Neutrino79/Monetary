import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '@/components/ui/Dialog'

function phone(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener() {}, removeEventListener() {} }))
}
beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn()
})

function pull(from: number, to: number, type = 'touch') {
  const title = screen.getByText('Add friend')
  const header = title.closest('.touch-none') as HTMLElement
  fireEvent.pointerDown(header, { pointerType: type, clientY: from, pointerId: 1, timeStamp: 0 })
  fireEvent.pointerMove(header, { pointerType: type, clientY: to, pointerId: 1 })
  fireEvent.pointerUp(header, { pointerType: type, clientY: to, pointerId: 1, timeStamp: 400 })
}

describe('sheet drag to close', () => {
  it('closes after a long pull down on a phone', () => {
    phone(true)
    const onOpenChange = vi.fn()
    render(<Modal open onOpenChange={onOpenChange} title="Add friend">body</Modal>)
    pull(100, 300)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('springs back after a short pull', () => {
    phone(true)
    const onOpenChange = vi.fn()
    render(<Modal open onOpenChange={onOpenChange} title="Add friend">body</Modal>)
    pull(100, 130)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('ignores a mouse and wide screens', () => {
    phone(true)
    const a = vi.fn()
    const { unmount } = render(<Modal open onOpenChange={a} title="Add friend">body</Modal>)
    pull(100, 300, 'mouse')
    expect(a).not.toHaveBeenCalled()
    unmount()
    phone(false)
    const b = vi.fn()
    render(<Modal open onOpenChange={b} title="Add friend">body</Modal>)
    pull(100, 300)
    expect(b).not.toHaveBeenCalled()
  })
})
