import { describe, expect, it } from 'vitest'
import { cardStats, statementText } from '@/lib/utils/creditCard'

describe('cardStats', () => {
  const day = new Date(2026, 9, 24) // 24 Oct 2026
  it('works out available credit, utilisation and days to the statement', () => {
    expect(cardStats({ balance: 30000, creditLimit: 100000, statementDay: 28 }, day)).toEqual({ available: 70000, utilisationPct: 30, daysToStatement: 4 })
  })
  it('never reports negative credit and handles a missing limit or statement day', () => {
    expect(cardStats({ balance: 120000, creditLimit: 100000, statementDay: null }, day)).toEqual({ available: 0, utilisationPct: 120, daysToStatement: null })
    expect(cardStats({ balance: 500, creditLimit: null, statementDay: 24 }, day)).toEqual({ available: null, utilisationPct: null, daysToStatement: 0 })
  })
  it('words the statement date', () => {
    expect([0, 1, 5].map(statementText)).toEqual(['Statement today', 'Statement tomorrow', 'Statement in 5 days'])
  })
})
