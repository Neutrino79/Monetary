import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from '@/components/ui/DatePicker'
import { MonthStepper } from '@/components/ui/MonthStepper'
import { formatPickerDate, formatPickerMonth, monthGrid } from '@/lib/utils/calendar'

describe('calendar helpers', () => {
  it('builds Monday-first weeks with null padding', () => {
    const weeks = monthGrid(2026, 9) // October 2026 starts on a Thursday
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, '2026-10-01'])
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks.flat().filter(Boolean)).toHaveLength(31)
  })
  it('formats dates and months for display', () => {
    expect(formatPickerDate('2026-10-24')).toBe('24 Oct 2026')
    expect(formatPickerMonth('2026-10')).toBe('October 2026')
  })
})

function DateHarness({ max }: { max?: string }) {
  const [v, setV] = useState('2026-03-05')
  return <><DatePicker aria-label="When" value={v} onChange={setV} max={max} clearable /><output>{v}</output></>
}

describe('DatePicker', () => {
  it('shows the formatted value and picks a day in the shown month', async () => {
    const user = userEvent.setup()
    render(<DateHarness />)
    expect(screen.getByRole('button', { name: 'When' })).toHaveTextContent('5 Mar 2026')
    await user.click(screen.getByRole('button', { name: 'When' }))
    await user.click(await screen.findByRole('gridcell', { name: '17 Mar 2026' }))
    expect(screen.getByRole('status')).toHaveTextContent('2026-03-17')
  })
  it('disables days after max and can clear', async () => {
    const user = userEvent.setup()
    render(<DateHarness max="2026-03-10" />)
    await user.click(screen.getByRole('button', { name: 'When' }))
    expect(await screen.findByRole('gridcell', { name: '11 Mar 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})

function MonthHarness() {
  const [v, setV] = useState('2026-01')
  return <><MonthStepper value={v} onChange={setV} max="2026-03" /><output>{v}</output></>
}

describe('MonthStepper', () => {
  it('steps months, stops at max, and jumps via the popover', async () => {
    const user = userEvent.setup()
    render(<MonthHarness />)
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('status')).toHaveTextContent('2026-03')
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Month' }))
    await user.click(await screen.findByRole('button', { name: 'February 2026' }))
    expect(screen.getByRole('status')).toHaveTextContent('2026-02')
  })
})
