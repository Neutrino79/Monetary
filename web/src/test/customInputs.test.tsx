import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select, AmountInput, FormField } from '@/components/ui/form'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { pickDay, visibleRange, RANGE_PRESETS } from '@/lib/utils/dateRangeSelect'
import { selectValue } from './helpers'

describe('pickDay / visibleRange', () => {
  it('first click starts, second click finishes', () => {
    const a = pickDay({ start: '', end: '' }, '2026-03-05')
    expect(a).toEqual({ start: '2026-03-05', end: '', done: false })
    expect(pickDay(a, '2026-03-09')).toEqual({ start: '2026-03-05', end: '2026-03-09', done: true })
  })
  it('an earlier second click becomes the start, and the same day is a one-day range', () => {
    expect(pickDay({ start: '2026-03-09', end: '' }, '2026-03-05')).toEqual({ start: '2026-03-05', end: '2026-03-09', done: true })
    expect(pickDay({ start: '2026-03-09', end: '' }, '2026-03-09')).toEqual({ start: '2026-03-09', end: '2026-03-09', done: true })
  })
  it('a click after a finished range starts a new one', () => {
    expect(pickDay({ start: '2026-03-05', end: '2026-03-09' }, '2026-04-01')).toEqual({ start: '2026-04-01', end: '', done: false })
  })
  it('previews up to the hovered day, in either direction', () => {
    expect(visibleRange({ start: '2026-03-05', end: '' }, '2026-03-08')).toEqual({ lo: '2026-03-05', hi: '2026-03-08' })
    expect(visibleRange({ start: '2026-03-05', end: '' }, '2026-03-02')).toEqual({ lo: '2026-03-02', hi: '2026-03-05' })
    expect(visibleRange({ start: '', end: '' }, '')).toBeNull()
  })
  it('presets', () => {
    const r = (l: string) => RANGE_PRESETS.find((p) => p.label === l)!.range('2026-03-15')
    expect(r('Last 7 days')).toEqual({ start: '2026-03-09', end: '2026-03-15' })
    expect(r('Last month')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(r('This month')).toEqual({ start: '2026-03-01', end: '2026-03-15' })
  })
})

function Harness({ onPick }: { onPick?: (v: string) => void }) {
  const [v, setV] = useState('b')
  return (
    <FormField label="Fruit">
      <Select
        value={v}
        onChange={(e) => {
          setV(e.target.value)
          onPick?.(e.target.value)
        }}
      >
        <option value="">None</option>
        <option value="a">Apple</option>
        <option value="b">Banana</option>
        <optgroup label="Citrus">
          <option value="c">Orange</option>
          <option value="d" disabled>
            Lemon
          </option>
        </optgroup>
      </Select>
    </FormField>
  )
}

describe('Select', () => {
  it('shows the selected label, is found by its label, and picks with the mouse', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    const trigger = screen.getByLabelText('Fruit')
    expect(trigger).toHaveTextContent('Banana')
    await selectValue(user, trigger, 'c')
    expect(onPick).toHaveBeenCalledWith('c')
    expect(trigger).toHaveTextContent('Orange')
  })
  it('groups options, marks the current one, and ignores disabled ones', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(screen.getByLabelText('Fruit'))
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('group', { name: 'Citrus' })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(list).getByRole('option', { name: 'Lemon' }))
    expect(onPick).not.toHaveBeenCalled()
  })
  it('works from the keyboard', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(screen.getByLabelText('Fruit'))
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith('c')
  })
  it('adds a search box for long lists', async () => {
    const user = userEvent.setup()
    render(
      <Select value="" onChange={() => {}} aria-label="Zone">
        {Array.from({ length: 20 }, (_, i) => (
          <option key={i} value={`z${i}`}>{`Zone ${i}`}</option>
        ))}
      </Select>,
    )
    await user.click(screen.getByLabelText('Zone'))
    await user.type(await screen.findByLabelText('Search options'), 'Zone 1')
    expect(screen.queryByRole('option', { name: 'Zone 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Zone 15' })).toBeInTheDocument()
  })
})

describe('AmountInput', () => {
  it('accepts digits and two decimals only', async () => {
    const user = userEvent.setup()
    function Box() {
      const [v, setV] = useState('')
      return <AmountInput aria-label="Amount" value={v} onChange={(e) => setV(e.target.value)} />
    }
    render(<Box />)
    const input = screen.getByLabelText('Amount')
    await user.type(input, '12a.5e-3.999')
    expect(input).toHaveValue('12.53')
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).not.toHaveAttribute('type', 'number')
  })
})

describe('DateRangePicker', () => {
  function Box({ onChange }: { onChange: (r: { from: string; to: string }) => void }) {
    const [r, setR] = useState({ from: '', to: '' })
    return (
      <DateRangePicker
        aria-label="Range"
        max="2026-03-31"
        from={r.from}
        to={r.to}
        onChange={(n) => {
          setR(n)
          onChange(n)
        }}
      />
    )
  }
  async function toMarch(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Range' }))
    for (let i = 0; i < 60 && !screen.queryByRole('grid', { name: 'March 2026' }); i++) {
      await user.click(await screen.findByRole('button', { name: 'Previous month' }))
    }
  }
  it('picks both ends in one calendar, highlights the days between, and shows the range on the trigger', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Box onChange={onChange} />)
    await toMarch(user)
    await user.click(screen.getByRole('gridcell', { name: '5 Mar 2026' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Now choose the last day')).toBeInTheDocument()
    await user.hover(screen.getByRole('gridcell', { name: '8 Mar 2026' })) // live preview
    expect(screen.getByRole('gridcell', { name: '6 Mar 2026' })).toHaveAttribute('data-range', 'inside')
    expect(screen.getByRole('gridcell', { name: '8 Mar 2026' })).toHaveAttribute('data-range', 'edge')
    await user.click(screen.getByRole('gridcell', { name: '9 Mar 2026' }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-03-05', to: '2026-03-09' })
    expect(screen.getByRole('button', { name: 'Range' })).toHaveTextContent('5 Mar 2026 – 9 Mar 2026')
  })
  it('reopens on the chosen range with it highlighted, and can be cleared', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Box onChange={onChange} />)
    await toMarch(user)
    await user.click(screen.getByRole('gridcell', { name: '5 Mar 2026' }))
    await user.click(screen.getByRole('gridcell', { name: '9 Mar 2026' }))
    await user.click(screen.getByRole('button', { name: 'Range' }))
    expect(await screen.findByRole('gridcell', { name: '7 Mar 2026' })).toHaveAttribute('data-range', 'inside')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenLastCalledWith({ from: '', to: '' })
    expect(screen.getByRole('button', { name: 'Range' })).toHaveTextContent('Select dates')
  })
  it('cannot pick days after the limit, and presets apply in one click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Box onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Range' }))
    await user.click(await screen.findByRole('button', { name: 'Last 7 days' }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-03-25', to: '2026-03-31' })
  })
})
