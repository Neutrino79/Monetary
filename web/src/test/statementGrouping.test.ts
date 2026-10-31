import { describe, it, expect } from 'vitest'
import type { StatementRow } from '@/types'
import { groupByDay, groupByMonth, monthLabel, statementTotals } from '@/lib/utils/statement'

const row = (entryType: string, date: string, delta: number): StatementRow => ({ entryId: 1, description: 'x', entryType, date, delta, runningBalance: 0 })

describe('statement grouping', () => {
  it('groups consecutive lines of the same day and keeps their order', () => {
    const groups = groupByDay([{ date: '2026-10-02', n: 1 }, { date: '2026-10-02', n: 2 }, { date: '2026-10-01', n: 3 }])
    expect(groups.map((g) => [g.date, g.rows.map((r) => r.n)])).toEqual([['2026-10-02', [1, 2]], ['2026-10-01', [3]]])
  })

  it('groups by month with the net change of each month', () => {
    const groups = groupByMonth([row('SPLIT', '2026-10-16', 1400), row('FRONTED', '2026-10-06', -600), row('SPLIT', '2026-09-20', 200)])
    expect(groups.map((g) => [g.key, g.net, g.rows.length])).toEqual([['2026-10', 800, 2], ['2026-09', 200, 1]])
    expect(monthLabel('2026-10-16')).toMatch(/October 2026/)
  })

  it('totals what each side paid and leaves settlements out', () => {
    const totals = statementTotals([row('SPLIT', '2026-10-16', 1400), row('SPLIT', '2026-10-12', 800), row('FRONTED', '2026-10-06', -600), row('SETTLEMENT', '2026-10-20', -500)])
    expect(totals).toEqual({ youPaid: 2200, theyPaid: 600 })
  })
})
