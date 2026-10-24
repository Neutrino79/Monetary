import { describe, it, expect } from 'vitest'
import { buildAttention, daysUntilDayOfMonth } from '@/lib/utils/attention'
import type { Account, BudgetStatus, FriendBalance } from '@/types'

const acct = (over: Partial<Account>): Account => ({
  id: 1, name: 'HDFC', accountType: 'ASSET', subtype: 'bank', currency: 'INR', isActive: true, balance: 1000,
  creditLimit: null, statementDay: null, createdAt: 'x', updatedAt: 'x', ...over,
})
const budget = (over: Partial<BudgetStatus>): BudgetStatus => ({
  categoryId: 1, categoryName: 'Food', budget: 1000, spent: 100, remaining: 900, percentageUsed: 10, overBudget: false, notPaidBack: 0, ...over,
})
const friend = (over: Partial<FriendBalance>): FriendBalance => ({ friendId: 1, friendName: 'Rahul', balance: 0, frontedUnpaid: 0, ...over })
const run = (o: { budgets?: BudgetStatus[]; accounts?: Account[]; friendBalances?: FriendBalance[]; today?: Date }) =>
  buildAttention({ budgets: [], accounts: [], friendBalances: [], today: new Date(2026, 9, 16), ...o })

describe('daysUntilDayOfMonth', () => {
  it('counts to the next time the day comes round', () => {
    expect(daysUntilDayOfMonth(18, new Date(2026, 9, 16))).toBe(2)
    expect(daysUntilDayOfMonth(16, new Date(2026, 9, 16))).toBe(0)
    expect(daysUntilDayOfMonth(15, new Date(2026, 9, 16))).toBe(30) // next month
  })
  it('clamps a 31st to the end of a short month', () => {
    expect(daysUntilDayOfMonth(31, new Date(2026, 1, 20))).toBe(8) // 28 Feb 2026
  })
})

describe('buildAttention', () => {
  it('is empty when nothing needs a look', () => {
    expect(run({ budgets: [budget({})], accounts: [acct({})], friendBalances: [friend({})] })).toEqual([])
  })
  it('flags budgets that are close to or over their limit', () => {
    const items = run({ budgets: [budget({ percentageUsed: 85, remaining: 150 }), budget({ categoryId: 2, categoryName: 'Rent', overBudget: true, remaining: -200, percentageUsed: 120 })] })
    expect(items.map((i) => i.title)).toEqual(['Food is at 85% of its budget', 'Rent is over budget'])
    expect(items.every((i) => i.level === 'warn')).toBe(true)
  })
  it('flags an asset account below zero, but not a liability', () => {
    expect(run({ accounts: [acct({ id: 2, name: 'Paytm', balance: -3307 })] }).map((i) => i.title)).toEqual(['Paytm is below zero'])
    expect(run({ accounts: [acct({ accountType: 'LIABILITY', balance: 500 })] })).toEqual([])
  })
  it('flags a card near its limit and an upcoming statement, and skips inactive accounts', () => {
    const card = acct({ id: 3, name: 'ICICI', accountType: 'LIABILITY', balance: 130000, creditLimit: 150000, statementDay: 18 })
    expect(run({ accounts: [card] }).map((i) => i.title)).toEqual(['ICICI: 87% of the limit used', 'ICICI statement is in 2 days'])
    expect(run({ accounts: [{ ...card, isActive: false }] })).toEqual([])
    expect(run({ accounts: [{ ...card, balance: 0 }] })).toEqual([])
  })
  it('lists what friends owe you and what you owe, warnings first', () => {
    const items = run({ friendBalances: [friend({ friendId: 1, friendName: 'Rahul', balance: 1800 }), friend({ friendId: 2, friendName: 'Priya', balance: -600, frontedUnpaid: 600 })] })
    expect(items.map((i) => i.title)).toEqual(['You owe Priya ₹600', 'Rahul owes you ₹1,800'])
    expect(items[0].detail).toContain('paid for you')
  })
})
