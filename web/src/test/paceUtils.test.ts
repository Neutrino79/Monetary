import { describe, it, expect, beforeAll } from 'vitest'
import { dayTicks, niceAxis } from '@/lib/utils/chartAxis'
import { formatCompact, setDisplayCurrency } from '@/lib/utils/format'
import { paceHeadline } from '@/lib/utils/paceHeadline'
import { buildSpendRows } from '@/lib/utils/spendRows'
import type { BudgetStatus, CategoryTotal, SpendingPace } from '@/types'

beforeAll(() => setDisplayCurrency('INR'))

describe('chart axis', () => {
  it('ends on a round number that covers the data, in three equal steps', () => {
    expect(niceAxis(46_000)).toEqual({ max: 60_000, ticks: [0, 20_000, 40_000, 60_000] })
    expect(niceAxis(52_000).max).toBeGreaterThanOrEqual(52_000)
    expect(niceAxis(0).ticks).toHaveLength(4)
    for (const v of [1, 7, 999, 12_345, 1_234_567]) expect(niceAxis(v).max).toBeGreaterThanOrEqual(v)
  })
  it('labels the first and last day with a few between, fewer when narrow', () => {
    expect(dayTicks(31, false)).toEqual([1, 5, 10, 15, 20, 25, 31])
    expect(dayTicks(30, true)).toEqual([1, 7, 14, 21, 30])
    expect(dayTicks(28, false)[0]).toBe(1)
  })
  it('writes axis amounts in thousands, lakhs and crores', () => {
    expect(formatCompact(500)).toBe('₹500')
    expect(formatCompact(62_000)).toBe('₹62k')
    expect(formatCompact(150_000)).toBe('₹1.5L')
    expect(formatCompact(30_000_000)).toBe('₹3Cr')
    expect(formatCompact(-2_000)).toBe('−₹2k')
  })
})

const pace = (over: Partial<SpendingPace> = {}): SpendingPace => ({
  year: 2026, month: 10, daysInMonth: 31, elapsedDays: 2, isCurrentMonth: true,
  days: [{ day: 1, spent: 100, cumulative: 100 }, { day: 2, spent: 400, cumulative: 500 }],
  previousMonth: '2026-09', previous: [], budgetTotal: 1000, projection: null, ...over,
})
const proj = (method: 'history' | 'pace', expected: number) => ({ method, basisMonths: 3, expected, low: expected, high: expected, days: [] })

describe('pace headline', () => {
  it('current month with a projection', () => {
    expect(paceHeadline(pace({ projection: proj('history', 800) }), 'October 2026')).toEqual({ text: 'On pace to spend about ₹800, ₹200 under your ₹1,000 budget', tone: 'good' })
    expect(paceHeadline(pace({ projection: proj('pace', 1300) }), 'October 2026')).toEqual({ text: "At this pace you'll spend about ₹1,300, ₹300 over your ₹1,000 budget", tone: 'bad' })
    expect(paceHeadline(pace({ projection: proj('history', 800), budgetTotal: null }), 'October 2026').text).toBe('On pace to spend about ₹800 this month')
  })
  it('current month without one', () => {
    expect(paceHeadline(pace(), 'October 2026').text).toBe('₹500 spent so far, of your ₹1,000 budget')
    expect(paceHeadline(pace({ budgetTotal: null }), 'October 2026').text).toBe('₹500 spent so far this month')
  })
  it('a finished month', () => {
    const past = { isCurrentMonth: false }
    expect(paceHeadline(pace(past), 'September 2026').text).toBe('You spent ₹500 in September 2026, ₹500 under budget')
    expect(paceHeadline(pace({ ...past, budgetTotal: 300 }), 'September 2026')).toEqual({ text: 'You spent ₹500 in September 2026, ₹200 over budget', tone: 'bad' })
  })
})

describe('spending rows', () => {
  const spending: CategoryTotal[] = [
    { categoryId: 1, categoryName: 'Rent', total: 14_500, children: [] },
    { categoryId: 2, categoryName: 'Food', total: 9_000, children: [] },
    { categoryId: 3, categoryName: 'Idle', total: 0, children: [] },
    { categoryId: 4, categoryName: 'Gym', total: 0, children: [] },
  ]
  const budgets = [{ categoryId: 2, budget: 12_000, notPaidBack: 300 }, { categoryId: 4, budget: 1_000, notPaidBack: 0 }] as BudgetStatus[]
  it('lists what was spent, plus budgeted categories even at zero, biggest first, with budgets attached', () => {
    const rows = buildSpendRows(spending, budgets, (id) => (id === 1 ? '#111111' : undefined))
    expect(rows.map((r) => r.name)).toEqual(['Rent', 'Food', 'Gym'])
    expect(rows[0]).toMatchObject({ budget: null, color: '#111111' })
    expect(rows[1]).toMatchObject({ budget: 12_000, notPaidBack: 300 })
  })
  it('caps the list', () => {
    expect(buildSpendRows(spending, budgets, () => undefined, 2)).toHaveLength(2)
  })
})
