import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkeletonCardGrid, SkeletonChart, SkeletonList, SkeletonReport, SkeletonStatement, SkeletonStats } from '@/components/ui/skeletons'

describe('skeleton placeholders', () => {
  it('draw the number of rows, tiles and cards asked for and are marked busy', () => {
    const { container } = render(<><SkeletonList rows={4} /><SkeletonStats count={3} /><SkeletonCardGrid count={2} /></>)
    expect(screen.getAllByLabelText('Loading')).toHaveLength(3)
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(3)
    expect(container.querySelectorAll('.divide-y > div')).toHaveLength(4)
  })

  it('compose a report and a statement without any text content', () => {
    const { container } = render(<><SkeletonReport /><SkeletonStatement /><SkeletonChart /></>)
    expect(container.textContent).toBe('')
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(20)
  })
})
