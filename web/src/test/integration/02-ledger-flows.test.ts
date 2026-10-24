/**
 * Ledger workflows through the real services against the real backend. Every
 * balance / total below is calculated by the backend and checked against
 * numbers worked out by hand in the comments.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { authService } from '@/lib/api/services/authService'
import { metaService } from '@/lib/api/services/metaService'
import { accountsService } from '@/lib/api/services/accountsService'
import { categoriesService } from '@/lib/api/services/categoriesService'
import { friendsService } from '@/lib/api/services/friendsService'
import { transactionsService } from '@/lib/api/services/transactionsService'
import { reportsService } from '@/lib/api/services/reportsService'
import { tokenStorage } from '@/lib/api/tokenStorage'
import { today, toMonthKey } from '@/lib/utils/clock'
import { ApiError } from '@/lib/api/errors'
import type { Account, Friend, Id } from '@/types'
import { OWNER } from './fixtures'

const D = today()
const month = toMonthKey(new Date())
const bal = async (id: Id) => (await accountsService.list()).find((a) => a.id === id)!.balance

let bank: Account, wallet: Account, card: Account
let priya: Friend
let groceries: Id, salary: Id
let baseline: Awaited<ReturnType<typeof reportsService.dashboard>>
let expenseId: Id

beforeAll(async () => {
  localStorage.clear()
  queryClient.clear()
  await useAuthStore.getState().login(OWNER.email, OWNER.password)
  groceries = (await categoriesService.list('EXPENSE')).find((c) => c.name === 'Groceries')!.id
  salary = (await categoriesService.list('INCOME')).find((c) => c.name === 'Salary')!.id
  baseline = await reportsService.dashboard('INR', month)
})

describe('branding and identity', () => {
  it('serves the configured product name', async () => {
    expect(await metaService.getBranding()).toMatchObject({ name: 'Monetary' })
    expect(await metaService.isSetupComplete()).toBe(true)
  })

  it('reads the owner with the fields the UI needs', async () => {
    const me = await authService.fetchOwner()
    expect(me).toMatchObject({ email: OWNER.email, isSuperuser: true, homeCurrencyCode: 'INR', ledgerMode: 'DIRECT' })
    expect(me.createdAt).toBeTruthy()
  })
})

describe('accounts', () => {
  it('creates accounts; opening balances become ledger entries; credit limit only on liabilities', async () => {
    bank = await accountsService.create({ name: 'Flow Bank', accountType: 'ASSET', subtype: 'bank', currency: 'INR', openingBalance: 2000 })
    wallet = await accountsService.create({ name: 'Flow Wallet', accountType: 'ASSET', subtype: 'wallet', currency: 'INR' })
    card = await accountsService.create({ name: 'Flow Card', accountType: 'LIABILITY', subtype: 'credit_card', currency: 'INR', openingBalance: 300, creditLimit: 50000, statementDay: 5 })
    expect(bank.balance).toBe(2000)
    expect(wallet.balance).toBe(0)
    expect(card).toMatchObject({ balance: 300, creditLimit: 50000, statementDay: 5, subtype: 'credit_card' }) // amount owed, shown positive

    await expect(accountsService.create({ name: 'Bad', accountType: 'ASSET', subtype: 'bank', currency: 'INR', creditLimit: 100 })).rejects.toMatchObject({
      status: 422, message: expect.stringContaining('LIABILITY'),
    })
  })

  it('reports per-field errors from request validation', async () => {
    const err = await accountsService.create({ name: 'Bad2', accountType: 'LIABILITY', subtype: 'credit_card', currency: 'INR', statementDay: 40 }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.fieldErrors.statementDay).toBeTruthy()
  })

  it('updates, archives and restores', async () => {
    const renamed = await accountsService.update(wallet.id, { name: 'Flow Wallet 2' })
    expect(renamed.name).toBe('Flow Wallet 2')
    expect((await accountsService.archive(wallet.id)).isActive).toBe(false)
    expect((await accountsService.restore(wallet.id)).isActive).toBe(true)
  })
})

describe('the transaction lifecycle (DIRECT mode)', () => {
  beforeAll(async () => {
    priya = await friendsService.create({ name: 'Priya', email: 'priya@example.com', phone: '+91 90000 00000' })
  })

  it('records income, expense, transfer, split, settlement and refund', async () => {
    await transactionsService.create({ type: 'income', description: 'Pay', date: D, amount: 500, accountId: bank.id, categoryId: salary })
    const exp = await transactionsService.create({ type: 'expense', description: 'Weekly shop', date: D, amount: 100, accountId: bank.id, categoryId: groceries, memo: 'organic' })
    expenseId = exp.id
    expect(exp).toMatchObject({ type: 'expense', amount: 100, memo: 'organic', status: 'posted' })
    await transactionsService.create({ type: 'transfer', description: 'Cash', date: D, amount: 200, accountId: bank.id, toAccountId: wallet.id })
    const split = await transactionsService.create({
      type: 'split', description: 'Dinner', date: D, amount: 300, accountId: bank.id, categoryId: groceries,
      yourShare: 100, splits: [{ friendId: priya.id, share: 200 }],
    })
    expect(split).toMatchObject({ type: 'split', amount: 300, yourShare: 100, splits: [{ friendId: priya.id, share: 200 }] })
    const settle = await transactionsService.settle({ friendId: priya.id, accountId: bank.id, amount: 50, direction: 'receive', date: D })
    expect(settle).toMatchObject({ type: 'settlement', direction: 'receive', friendId: priya.id })
    const refund = await transactionsService.create({ type: 'refund', description: 'Refund', date: D, amount: 20, refundOfId: expenseId })
    expect(refund).toMatchObject({ type: 'refund', refundOfId: expenseId, accountId: bank.id })

    // 2000 +500 -100 -200(transfer) -300(split) +50 +20 = 1970 ; wallet 200 ; card still owes 300
    expect(await bal(bank.id)).toBe(1970)
    expect(await bal(wallet.id)).toBe(200)
    expect(await bal(card.id)).toBe(300)
  })

  it('computes friend balances on the server (Priya owes 200 - 50 = 150)', async () => {
    const b = (await friendsService.balances()).find((x) => x.friendId === priya.id)!
    expect(b.balance).toBe(150)
  })

  it('computes the dashboard on the server (deltas vs. the baseline taken before the flow)', async () => {
    const d = await reportsService.dashboard('INR', month)
    expect(d.income - baseline.income).toBe(500) // opening balances are adjustments, not income
    expect(d.expense - baseline.expense).toBe(180) // 100 shop + 100 own share of dinner - 20 refund
    expect(d.savings - baseline.savings).toBe(320)
    expect(d.owedToYou - baseline.owedToYou).toBe(150)
    expect(d.netWorth - baseline.netWorth).toBe(1970 + 200 - 300) // two assets minus the card debt
    const food = (await reportsService.spending(month)).find((c) => c.categoryName === 'Food & Dining')!
    expect(food.children.find((c) => c.categoryName === 'Groceries')!.total).toBeGreaterThanOrEqual(180)
    const cash = await reportsService.cashflow(6)
    expect(cash).toHaveLength(6)
    expect(cash[cash.length - 1]!.income - 0).toBeGreaterThanOrEqual(500)
  })

  it('filters, sorts and pages on the server', async () => {
    const expenses = await transactionsService.list({ type: ['expense'], search: 'Weekly', dateFrom: D, dateTo: D })
    expect(expenses.items.map((t) => t.description)).toEqual(['Weekly shop'])
    const all = await transactionsService.list({ limit: 3, offset: 0, sort: 'amount', direction: 'desc' })
    expect(all.items).toHaveLength(3)
    expect(all.total).toBeGreaterThan(3)
    expect(all.items[0]!.amount).toBeGreaterThanOrEqual(all.items[1]!.amount)
    const forPriya = await transactionsService.list({ friendId: priya.id })
    expect(forPriya.items.map((t) => t.type).sort()).toEqual(['settlement', 'split'])
    const refunds = await transactionsService.list({ refundOfId: expenseId })
    expect(refunds.items).toHaveLength(1)
  })

  it('edits a transaction in place and clears its memo', async () => {
    const edited = await transactionsService.update(expenseId, { amount: 150, memo: null })
    expect(edited).toMatchObject({ id: expenseId, amount: 150, memo: null })
    expect(await bal(bank.id)).toBe(1920) // 50 more spent
  })

  it('rejects bad input with the server\'s own messages', async () => {
    await expect(transactionsService.create({
      type: 'split', description: 'x', date: D, amount: 100, accountId: bank.id, categoryId: groceries, yourShare: 10, splits: [{ friendId: priya.id, share: 50 }],
    })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('add up') })

    await expect(transactionsService.settle({ friendId: priya.id, accountId: bank.id, amount: 10, direction: 'pay' })).rejects.toMatchObject({
      status: 422, message: expect.stringContaining('not one you pay'),
    })
    await expect(transactionsService.settle({ friendId: priya.id, accountId: bank.id, amount: 9999 })).rejects.toMatchObject({ status: 409 })
    await expect(transactionsService.create({ type: 'refund', description: 'r', date: D, amount: 999, refundOfId: expenseId })).rejects.toMatchObject({ status: 409 })

    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 3)
    await expect(transactionsService.create({
      type: 'expense', description: 'future', date: tomorrow.toISOString().slice(0, 10), amount: 1, accountId: bank.id, categoryId: groceries,
    })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('future') })
  })

  it('guards a settled split behind an explicit force', async () => {
    const dinner = (await transactionsService.list({ type: ['split'], search: 'Dinner' })).items[0]!
    await expect(transactionsService.update(dinner.id, { description: 'Dinner (renamed)' })).rejects.toMatchObject({ status: 409 })
    const ok = await transactionsService.update(dinner.id, { description: 'Dinner (renamed)' }, { force: true })
    expect(ok.description).toBe('Dinner (renamed)')
  })
})

describe('STRICT mode corrections', () => {
  it('replaces rather than edits: the original is reversed and linked, and balances stay right', async () => {
    await authService.updateProfile({ ledgerMode: 'STRICT' })
    expect((await authService.fetchOwner()).ledgerMode).toBe('STRICT')

    const before = await bal(bank.id)
    const corrected = await transactionsService.update(expenseId, { amount: 120 })
    expect(corrected.id).not.toBe(expenseId)
    expect(corrected.correctionOf).toBe(expenseId)
    expect(await bal(bank.id)).toBe(before + 30) // 150 -> 120

    const original = await transactionsService.get(expenseId)
    expect(original).toMatchObject({ status: 'reversed', replacedBy: corrected.id })
    const posted = await transactionsService.list({ search: 'Weekly shop' })
    expect(posted.items.map((t) => t.id)).toEqual([corrected.id]) // reversed original and system reversal row are hidden
    const withReversed = await transactionsService.list({ search: 'Weekly shop', status: 'all' })
    expect(withReversed.items.map((t) => t.id).sort()).toEqual([expenseId, corrected.id].sort())

    await transactionsService.remove(corrected.id)
    expect(await bal(bank.id)).toBe(before + 30 + 120) // 120 is given back; nothing is deleted, the delete is a reversal
    await authService.updateProfile({ ledgerMode: 'DIRECT' })
  })
})

describe('categories, income sources and friends', () => {
  it('manages categories, with the same rules the UI shows', async () => {
    const pets = await categoriesService.create({ name: 'Pets', type: 'EXPENSE', color: '#aa5500', budgetLimit: 500 })
    expect(pets).toMatchObject({ color: '#aa5500', budgetLimit: 500, parentId: null })
    const vet = await categoriesService.create({ name: 'Vet', type: 'EXPENSE', parentId: pets.id })
    await expect(categoriesService.update(pets.id, { parentId: vet.id })).rejects.toMatchObject({ status: 422 })
    expect((await categoriesService.update(pets.id, { budgetLimit: null })).budgetLimit).toBeNull()
    await expect(categoriesService.archive(pets.id)).rejects.toMatchObject({ status: 422 }) // child still active
    await categoriesService.archive(vet.id)
    await categoriesService.archive(pets.id)
    expect((await categoriesService.list('EXPENSE')).some((c) => c.id === pets.id)).toBe(false)
    expect((await categoriesService.restore(pets.id)).isActive).toBe(true)
  })

  it('manages income sources as INCOME categories', async () => {
    const side = await categoriesService.create({ name: 'Side gig', type: 'INCOME' })
    expect((await categoriesService.list('INCOME')).some((c) => c.id === side.id)).toBe(true)
    expect((await categoriesService.list('EXPENSE')).some((c) => c.id === side.id)).toBe(false)
  })

  it('updates friends (clear vs. unchanged) and refuses to delete one with history', async () => {
    const updated = await friendsService.update(priya.id, { phone: null, name: 'Priya N' })
    expect(updated).toMatchObject({ phone: null, name: 'Priya N', email: 'priya@example.com' })
    await expect(friendsService.remove(priya.id)).rejects.toMatchObject({ status: 409 })
    const lone = await friendsService.create({ name: 'Temp', email: 'temp@example.com' })
    await friendsService.remove(lone.id)
    expect((await friendsService.list()).some((f) => f.id === lone.id)).toBe(false)
  })
})

describe('friend-paid (fronted) expenses', () => {
  it('counts as spending at once, touches no account, and tracks what is still unpaid', async () => {
    const dev = await friendsService.create({ name: 'Dev', email: 'dev@example.com' })
    const bankBefore = await bal(bank.id)
    const fronted = await transactionsService.create({
      type: 'fronted', description: 'Dinner (Dev paid)', date: D, amount: 100, categoryId: groceries, friendId: dev.id,
    })
    expect(fronted).toMatchObject({ type: 'fronted', friendId: dev.id, amount: 100, unpaid: 100 })
    expect(fronted.accountId).toBeUndefined()
    expect(await bal(bank.id)).toBe(bankBefore) // Dev paid, so none of your accounts moves

    const owed = (await friendsService.balances()).find((b) => b.friendId === dev.id)!
    expect(owed).toMatchObject({ balance: -100, frontedUnpaid: 100 })

    // paying back 40 leaves 60 of that expense unpaid; the repayment is not spending again
    await transactionsService.settle({ friendId: dev.id, accountId: bank.id, amount: 40, direction: 'pay', date: D })
    expect((await transactionsService.get(fronted.id)).unpaid).toBe(60)
    expect((await friendsService.balances()).find((b) => b.friendId === dev.id)).toMatchObject({ balance: -60, frontedUnpaid: 60 })
    expect(await bal(bank.id)).toBe(bankBefore - 40)

    await transactionsService.settle({ friendId: dev.id, accountId: bank.id, amount: 60, direction: 'pay', date: D })
    expect((await transactionsService.get(fronted.id)).unpaid).toBe(0)
  })
})

describe('edit an expense into a split, and delete a settlement', () => {
  it('splits an existing expense later, then removes a repayment', async () => {
    const mia = await friendsService.create({ name: 'Mia', email: 'mia@example.com' })
    const bankBefore = await bal(bank.id)
    const plain = await transactionsService.create({
      type: 'expense', description: 'Cab', date: D, amount: 100, accountId: bank.id, categoryId: groceries,
    })
    const split = await transactionsService.update(plain.id, { yourShare: 40, splits: [{ friendId: mia.id, share: 60 }] })
    expect(split).toMatchObject({ type: 'split', amount: 100, yourShare: 40 })
    expect(await bal(bank.id)).toBe(bankBefore - 100) // you still paid the whole bill
    expect((await friendsService.balances()).find((b) => b.friendId === mia.id)?.balance).toBe(60)

    const settle = await transactionsService.settle({ friendId: mia.id, accountId: bank.id, amount: 60, direction: 'receive', date: D })
    // a settlement is titled from what it covers, not with a generic word tacked on
    expect(settle.description).toMatch(/^Settlement from Mia — Cab/)
    expect(settle.description).not.toMatch(/— Settlement$/)

    // the friend's statement lists the split and the settlement with the balance after each
    const lines = await friendsService.statement(mia.id)
    expect(lines.map((l) => [l.entryType, l.delta, l.runningBalance])).toEqual([['SPLIT', 60, 60], ['SETTLEMENT', -60, 0]])
    expect(lines[0].date).toBe(D)

    await transactionsService.remove(settle.id)
    expect((await friendsService.balances()).find((b) => b.friendId === mia.id)?.balance).toBe(60)
    expect(await bal(bank.id)).toBe(bankBefore - 100)

    const back = await transactionsService.update(split.id, { splits: [] })
    expect(back).toMatchObject({ type: 'expense', amount: 100 })
    expect((await friendsService.balances()).find((b) => b.friendId === mia.id)?.balance).toBe(0)
  })
})

describe('sessions', () => {
  it('a session revoked on the server logs the app out on the next call', async () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    await authService.logout() // server-side invalidation only; the browser still holds the token
    await expect(accountsService.list()).rejects.toMatchObject({ status: 401 })
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, sessionExpired: true })
    expect(tokenStorage.get()).toBeNull()
  })

  it('wrong credentials are a 401 with a clear message and do not count as an expired session', async () => {
    await expect(useAuthStore.getState().login(OWNER.email, 'not-the-password')).rejects.toMatchObject({
      status: 401, message: 'Invalid email or password.',
    })
    await useAuthStore.getState().login(OWNER.email, OWNER.password)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('password reset works through the security question', async () => {
    const q = await authService.getResetQuestion(OWNER.email)
    expect(q.question).toMatch(/pet/i)
    await authService.resetPassword(OWNER.email, OWNER.answer, 'brand-new-pass-9')
    await expect(useAuthStore.getState().login(OWNER.email, OWNER.password)).rejects.toMatchObject({ status: 401 })
    await useAuthStore.getState().login(OWNER.email, 'brand-new-pass-9')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
