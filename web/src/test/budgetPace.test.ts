import { describe, expect, it } from 'vitest'
import { budgetPace, suggestBudget } from '@/lib/utils/budgetPace'

describe('budgetPace', () => {
  it('is on track when the monthly pace stays under the limit', () => {
    const p = budgetPace(1000, 3000, '2026-10', '2026-10-15') // 15 of 31 days
    expect(p.status).toBe('on-track')
    expect(Math.round(p.elapsedPct)).toBe(48)
    expect(Math.round(p.projected!)).toBe(2067)
  })
  it('is ahead of pace when the projection overshoots, and over once spent passes the limit', () => {
    expect(budgetPace(2000, 3000, '2026-10', '2026-10-15').status).toBe('ahead')
    expect(budgetPace(3100, 3000, '2026-10', '2026-10-15').status).toBe('over')
  })
  it('judges past months by the final figure and does not project them', () => {
    expect(budgetPace(2500, 3000, '2026-09', '2026-10-15')).toMatchObject({ status: 'finished', projected: null })
    expect(budgetPace(3500, 3000, '2026-09', '2026-10-15').status).toBe('over')
  })
})

describe('suggestBudget', () => {
  it('rounds up to a tidy figure', () => {
    expect(suggestBudget(0)).toBe(0)
    expect(suggestBudget(430)).toBe(500)
    expect(suggestBudget(2310)).toBe(2500)
  })
})
