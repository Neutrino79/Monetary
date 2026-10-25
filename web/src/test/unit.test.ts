import { describe, it, expect } from 'vitest'
import { apiErrorFromBody, ApiError } from '@/lib/api/errors'
import { buildQuery } from '@/lib/api/http'
import { fromMoney, toMajor, toTransaction, toDashboard, toAccount } from '@/lib/api/mappers'
import { colorForId } from '@/lib/utils/entityVisuals'
import { toISODate, today, toMonthKey } from '@/lib/utils/clock'
import { timezoneOptions } from '@/config/timezones'
import { formatCurrency, setDisplayCurrency, currencySymbol } from '@/lib/utils/format'
import type { TransactionDto, AccountDto } from '@/types/api'
import type { DashboardDto } from '@/lib/api/mappers'

const money = (points: number, currency = 'INR') => ({ points, major: `${currency} ${(points / 100).toFixed(2)}`, currency })

describe('error parsing', () => {
  it('reads a FastAPI string detail and the error type', () => {
    const e = apiErrorFromBody(409, 'Conflict', { detail: 'An owner already exists.', error_type: 'ConflictError' })
    expect(e).toBeInstanceOf(ApiError)
    expect([e.status, e.message, e.code]).toEqual([409, 'An owner already exists.', 'ConflictError'])
  })

  it('turns a 422 validation list into per-field messages keyed by the request field name', () => {
    const e = apiErrorFromBody(422, 'Unprocessable', {
      detail: [
        { loc: ['body', 'creditLimit'], msg: 'Input should be a valid string' },
        { loc: ['body', 'statementDay'], msg: 'Input should be less than or equal to 31' },
        { loc: ['body', 'creditLimit'], msg: 'second message is ignored' },
      ],
    })
    expect(e.fieldErrors).toEqual({ creditLimit: 'Input should be a valid string', statementDay: 'Input should be less than or equal to 31' })
    expect(e.message).toMatch(/^Please check your input/)
  })

  it('falls back to the status text when the body is not JSON', () => {
    expect(apiErrorFromBody(502, 'Bad Gateway', undefined).message).toBe('Bad Gateway')
  })
})

describe('query strings', () => {
  it('skips empty values and repeats array params', () => {
    expect(buildQuery({ a: 1, b: undefined, c: '', d: null, e: false, type: ['expense', 'income'] })).toBe('?a=1&e=false&type=expense&type=income')
    expect(buildQuery({})).toBe('')
    expect(buildQuery(undefined)).toBe('')
  })
})

describe('money mapping', () => {
  it('converts minor units to display numbers and back to the decimal string the API takes', () => {
    expect(fromMoney(money(123456))).toBe(1234.56)
    expect(toMajor(1234.5)).toBe('1234.50')
    expect(toMajor(0.1 + 0.2)).toBe('0.30') // float noise never reaches the wire
  })

  it('maps a flat transaction, turning nulls into undefined and money objects into numbers', () => {
    const dto: TransactionDto = {
      id: 7, type: 'split', description: 'Dinner', memo: null, date: '2026-03-10', currency: 'INR', status: 'posted',
      amount: money(50000), accountId: 1, toAccountId: null, categoryId: 4, friendId: null, direction: null,
      yourShare: money(15000), splits: [{ friendId: 9, share: money(35000) }], refundOfId: null, correctionOf: null,
      replacedBy: 12, createdAt: 'x', updatedAt: 'y', unpaid: null, groupKey: null,
    }
    const t = toTransaction(dto)
    expect(t).toMatchObject({ id: 7, amount: 500, yourShare: 150, splits: [{ friendId: 9, share: 350 }], replacedBy: 12, memo: null })
    expect(t.toAccountId).toBeUndefined()
    expect(t.refundOfId).toBeUndefined()
  })

  it('maps an account including a liability credit limit', () => {
    const dto: AccountDto = {
      id: 2, name: 'Visa', accountType: 'LIABILITY', currencyCode: 'INR', isActive: true, subtype: 'credit_card',
      creditLimit: money(5000000), statementDay: 5, balance: money(30000), lastActivity: '2026-10-20', createdAt: 'a', updatedAt: 'b',
    }
    expect(toAccount(dto)).toMatchObject({ balance: 300, creditLimit: 50000, statementDay: 5, currency: 'INR', lastActivity: '2026-10-20' })
  })

  it('picks the owner\'s home-currency bucket from per-currency report data', () => {
    const dto: DashboardDto = {
      year: 2026, month: 9,
      netWorth: [
        { currency: 'USD', assets: money(100, 'USD'), liabilities: money(0, 'USD'), netWorth: money(100, 'USD') },
        { currency: 'INR', assets: money(900000), liabilities: money(100000), netWorth: money(800000) },
      ],
      summary: [{ currency: 'INR', income: money(500000), expense: money(120000), savings: money(380000) }],
      budgetStatus: [], topSpending: [], incomeSummary: [], friendBalances: [],
      friendTotals: [{ currency: 'INR', owedToYou: money(35000), youOwe: money(8000) }],
    }
    const d = toDashboard(dto, 'INR')
    expect(d).toMatchObject({ netWorth: 8000, assets: 9000, liabilities: 1000, income: 5000, expense: 1200, savings: 3800, owedToYou: 350, youOwe: 80 })
  })
})

describe('dates (the user\'s local calendar, never UTC)', () => {
  it('builds ISO dates from local parts', () => {
    // 00:30 local on 1 Jan is still 1 Jan, even though toISOString() could say 31 Dec in zones ahead of UTC
    expect(toISODate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
    expect(toMonthKey(new Date(2026, 9, 1))).toBe('2026-10')
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('small helpers', () => {
  it('gives stable colours for entities that have none', () => {
    expect(colorForId(3)).toBe(colorForId(3))
    expect(colorForId(1)).not.toBe(colorForId(2))
    expect(colorForId(-4)).toMatch(/^#/)
  })

  it('offers the owner\'s current timezone first and no duplicates', () => {
    const zones = timezoneOptions('Pacific/Auckland')
    expect(zones[0]).toBe('Pacific/Auckland')
    expect(new Set(zones).size).toBe(zones.length)
  })

  it('formats in the configured display currency', () => {
    setDisplayCurrency('USD')
    expect(formatCurrency(1234.5, true)).toContain('1,234.50')
    expect(currencySymbol()).toBeTruthy()
    setDisplayCurrency('INR')
    expect(formatCurrency(1234.5)).toContain('₹')
  })
})
