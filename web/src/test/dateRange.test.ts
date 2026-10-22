import { describe, it, expect } from 'vitest'
import { currentMonthRange, isDefaultRange, rangeLabel, rangeToFilters, shiftMonth } from '@/lib/utils/dateRange'

const NOW = new Date(2026, 9, 22) // 22 Oct 2026

describe('date range filter', () => {
  it('defaults to the current month and treats it as the default', () => {
    expect(currentMonthRange(NOW)).toEqual({ mode: 'month', month: '2026-10' })
    expect(isDefaultRange({ mode: 'month', month: '2026-10' }, NOW)).toBe(true)
    expect(isDefaultRange({ mode: 'month', month: '2026-09' }, NOW)).toBe(false)
    expect(isDefaultRange({ mode: 'all' }, NOW)).toBe(false)
  })

  it('ends the current month today, and a past month on its last day', () => {
    expect(rangeToFilters({ mode: 'month', month: '2026-10' }, NOW)).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-10-22' })
    expect(rangeToFilters({ mode: 'month', month: '2026-02' }, NOW)).toEqual({ dateFrom: '2026-02-01', dateTo: '2026-02-28' })
    expect(rangeToFilters({ mode: 'month', month: '2024-02' }, NOW)).toEqual({ dateFrom: '2024-02-01', dateTo: '2024-02-29' })
  })

  it('passes custom dates through, and sends nothing for all time', () => {
    expect(rangeToFilters({ mode: 'custom', from: '2026-03-05', to: '2026-03-09' })).toEqual({ dateFrom: '2026-03-05', dateTo: '2026-03-09' })
    expect(rangeToFilters({ mode: 'custom', from: '', to: '2026-03-09' })).toEqual({ dateFrom: undefined, dateTo: '2026-03-09' })
    expect(rangeToFilters({ mode: 'all' })).toEqual({})
  })

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('labels each mode for the chip', () => {
    expect(rangeLabel({ mode: 'month', month: '2026-10' })).toBe('Oct 2026')
    expect(rangeLabel({ mode: 'custom', from: '2026-10-01', to: '2026-10-22' })).toBe('1 Oct 2026 – 22 Oct 2026')
    expect(rangeLabel({ mode: 'custom', from: '2026-10-01', to: '' })).toBe('From 1 Oct 2026')
    expect(rangeLabel({ mode: 'custom', from: '', to: '2026-10-22' })).toBe('Until 22 Oct 2026')
    expect(rangeLabel({ mode: 'custom', from: '', to: '' })).toBe('')
    expect(rangeLabel({ mode: 'all' })).toBe('')
  })
})
