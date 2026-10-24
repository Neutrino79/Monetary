import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VsLastMonth } from '@/components/domain/VsLastMonth'

describe('VsLastMonth', () => {
  it('shows the change and percentage against last month', () => {
    render(<VsLastMonth current={1120} previous={1000} previousMonth="2026-09" upIsGood={false} />)
    expect(screen.getByTestId('vs-last-month')).toHaveTextContent('↑ ₹120 (12%) vs Sep')
    expect(screen.getByTestId('vs-last-month')).toHaveClass('text-negative')   // spending went up: not good
  })
  it('colours falling spend as good, and stays quiet with no data', () => {
    const { rerender } = render(<VsLastMonth current={800} previous={1000} previousMonth="2026-09" upIsGood={false} />)
    expect(screen.getByTestId('vs-last-month')).toHaveClass('text-accent')
    rerender(<VsLastMonth current={0} previous={undefined} previousMonth="2026-09" upIsGood={false} />)
    expect(screen.queryByTestId('vs-last-month')).not.toBeInTheDocument()
  })
})
