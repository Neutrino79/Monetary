/** On phones the dark layer behind the menu must exist only while the menu is open. */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/Sidebar'
import { queryClient } from '@/lib/queryClient'

function overlay(open: boolean) {
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Sidebar mobileOpen={open} onCloseMobile={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return container.querySelector('div[aria-hidden="true"]') as HTMLElement
}

describe('mobile menu overlay', () => {
  it('is hidden at every width while the menu is closed', () => {
    const el = overlay(false)
    expect(el.className).toContain('hidden')
    expect(el.className).not.toContain('max-[980px]:block')   // that variant used to override "hidden" and dim the whole page
  })
  it('shows on small screens only while the menu is open', () => {
    const el = overlay(true)
    expect(el.className).toContain('max-[980px]:block')
  })
})
