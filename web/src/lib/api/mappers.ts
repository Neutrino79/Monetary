/**
 * Wire <-> domain translation. The ONLY place that knows backend money is
 * `{points, major, currency}` with 2-decimal minor units (the backend assumes
 * 2 decimals for every currency) and that nullable wire fields are optional in
 * the domain. Numbers produced here are for display/form input; the backend
 * remains the authority for every calculation.
 */
import type {
  Account, BudgetStatus, CashflowPoint, SpendingPace, Category, CategoryTotal, Dashboard, Bill, BillMatch, BillStatus, Friend, FriendBalance, Page, StatementRow, Transaction, TransactionGroup, User,
} from "@/types";
import type { AccountDto, BillDto, CategoryDto, MatchDto, FriendDto, MoneyDto, OwnerDto, PageDto, TransactionDto, TransactionGroupDto } from "@/types/api";
import { colorForId } from "@/lib/utils/entityVisuals";
import { initialsOf } from "@/lib/utils/format";

export const fromMoney = (m: MoneyDto): number => m.points / 100;
const optMoney = (m: MoneyDto | null | undefined): number | null => (m ? fromMoney(m) : null);

/** Number -> the decimal string the API takes ("1234.50"). Callers validate max 2 decimals first. */
export const toMajor = (n: number): string => n.toFixed(2);

const undef = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export function toUser(o: OwnerDto): User {
  return { ...o };
}

export function toAccount(a: AccountDto): Account {
  return {
    id: a.id, name: a.name, accountType: a.accountType, subtype: a.subtype, currency: a.currencyCode,
    isActive: a.isActive, balance: fromMoney(a.balance), creditLimit: optMoney(a.creditLimit),
    statementDay: a.statementDay, lastActivity: a.lastActivity ?? null, createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}

export function toCategory(c: CategoryDto): Category {
  return {
    id: c.id, name: c.name, type: c.accountType, color: c.color ?? colorForId(c.id),
    budgetLimit: optMoney(c.budgetLimit), parentId: c.parentId, isActive: c.isActive,
  };
}

export function toFriend(f: FriendDto): Friend {
  return {
    id: f.id, name: f.name, initials: initialsOf(f.name), email: f.email, phone: f.phone,
    color: colorForId(f.id), createdAt: f.createdAt,
  };
}

export function toTransaction(t: TransactionDto): Transaction {
  return {
    id: t.id, type: t.type, description: t.description, memo: t.memo, date: t.date, currency: t.currency,
    status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, amount: fromMoney(t.amount),
    accountId: undef(t.accountId), toAccountId: undef(t.toAccountId), categoryId: undef(t.categoryId),
    friendId: undef(t.friendId), direction: undef(t.direction),
    yourShare: t.yourShare ? fromMoney(t.yourShare) : undefined,
    splits: t.splits?.map((s) => ({ friendId: s.friendId, share: fromMoney(s.share) })),
    refundOfId: undef(t.refundOfId), correctionOf: undef(t.correctionOf), replacedBy: undef(t.replacedBy),
    unpaid: t.unpaid ? fromMoney(t.unpaid) : undefined,
    tags: t.tags ?? [],
    groupKey: undef(t.groupKey),
    bill: t.bill?.map(toBillStatus),
    settlesEntryId: undef(t.settlesEntryId), paymentGroup: undef(t.paymentGroup),
  };
}

type BillStatusDto = NonNullable<TransactionDto["bill"]>[number];
const toBillStatus = (b: BillStatusDto): BillStatus => ({
  friendId: b.friendId, amount: fromMoney(b.amount), paid: fromMoney(b.paid), matched: fromMoney(b.matched),
  remaining: fromMoney(b.remaining), status: b.status,
});

export const toBill = (b: BillDto): Bill => ({
  ...toBillStatus(b), entryId: b.entryId, type: b.type, direction: b.direction, description: b.description,
  date: b.date, currency: b.currency,
});

export const toMatch = (m: MatchDto): BillMatch => ({
  id: m.id, friendId: m.friendId, amount: fromMoney(m.amount), owedToMe: m.owedToMe, owedByMe: m.owedByMe, locked: m.locked,
});

export function toTransactionGroup(g: TransactionGroupDto): TransactionGroup {
  return {
    key: g.key, label: g.label, count: g.count,
    totals: g.totals.map((t) => ({ currency: t.currency, moneyIn: fromMoney(t.moneyIn), moneyOut: fromMoney(t.moneyOut) })),
  };
}

export function toPage<D, T>(page: PageDto<D>, map: (d: D) => T): Page<T> {
  return { items: page.items.map(map), total: page.total, limit: page.limit, offset: page.offset };
}

// ----------------------------------------------------------------- reports
interface BudgetDto { categoryId: number; categoryName: string; budget: MoneyDto; spent: MoneyDto; remaining: MoneyDto; percentageUsed: number; overBudget: boolean; notPaidBack: MoneyDto }
interface CategoryTotalDto { categoryId: number; categoryName: string; total: MoneyDto; children: { categoryId: number; categoryName: string; total: MoneyDto }[] }
interface FriendBalanceDto { friendId: number; friendName: string; balance: MoneyDto; frontedUnpaid: MoneyDto }
interface NetWorthDto { currency: string; assets: MoneyDto; liabilities: MoneyDto; netWorth: MoneyDto }
interface SummaryDto { currency: string; income: MoneyDto; expense: MoneyDto; savings: MoneyDto }
interface FriendTotalsDto { currency: string; owedToYou: MoneyDto; youOwe: MoneyDto }
export interface DashboardDto {
  year: number; month: number; netWorth: NetWorthDto[]; summary: SummaryDto[]; budgetStatus: BudgetDto[];
  topSpending: CategoryTotalDto[]; incomeSummary: CategoryTotalDto[]; friendBalances: FriendBalanceDto[]; friendTotals: FriendTotalsDto[];
}

export const toBudget = (b: BudgetDto): BudgetStatus => ({
  categoryId: b.categoryId, categoryName: b.categoryName, budget: fromMoney(b.budget), spent: fromMoney(b.spent),
  remaining: fromMoney(b.remaining), percentageUsed: b.percentageUsed, overBudget: b.overBudget,
  notPaidBack: fromMoney(b.notPaidBack),
});

export const toCategoryTotal = (c: CategoryTotalDto): CategoryTotal => ({
  categoryId: c.categoryId, categoryName: c.categoryName, total: fromMoney(c.total),
  children: c.children.map((k) => ({ categoryId: k.categoryId, categoryName: k.categoryName, total: fromMoney(k.total) })),
});

export interface StatementRowDto {
  entryId: number; description: string; entryType: string; date: string; status: string; delta: MoneyDto; runningBalance: MoneyDto;
  settlesEntryId?: number | null; paymentGroup?: string | null;
}

/** Reversed originals and their reversal entries cancel out, so they are dropped from what the person reads. */
export const toStatementRows = (rows: StatementRowDto[]): StatementRow[] =>
  rows
    .filter((r) => r.status.toUpperCase() === "POSTED" && r.entryType !== "REVERSAL")
    .map((r) => ({
      entryId: r.entryId, description: r.description, entryType: r.entryType, date: r.date,
      delta: fromMoney(r.delta), runningBalance: fromMoney(r.runningBalance),
      settlesEntryId: undef(r.settlesEntryId), paymentGroup: undef(r.paymentGroup),
    }));

export const toFriendBalance = (f: FriendBalanceDto): FriendBalance => ({
  friendId: f.friendId, friendName: f.friendName, balance: fromMoney(f.balance), frontedUnpaid: fromMoney(f.frontedUnpaid),
});

/** Reports are per currency; the app is single-currency, so pick the owner's home currency (first bucket as a fallback). */
export function toDashboard(d: DashboardDto, homeCurrency: string): Dashboard {
  const nw = d.netWorth.find((x) => x.currency === homeCurrency) ?? d.netWorth[0];
  const sm = d.summary.find((x) => x.currency === homeCurrency) ?? d.summary[0];
  const ft = d.friendTotals.find((x) => x.currency === homeCurrency) ?? d.friendTotals[0];
  return {
    year: d.year, month: d.month, currency: homeCurrency,
    netWorth: nw ? fromMoney(nw.netWorth) : 0, assets: nw ? fromMoney(nw.assets) : 0,
    liabilities: nw ? fromMoney(nw.liabilities) : 0,
    income: sm ? fromMoney(sm.income) : 0, expense: sm ? fromMoney(sm.expense) : 0, savings: sm ? fromMoney(sm.savings) : 0,
    budgets: d.budgetStatus.map(toBudget), topSpending: d.topSpending.map(toCategoryTotal),
    incomeSummary: d.incomeSummary.map(toCategoryTotal), friendBalances: d.friendBalances.map(toFriendBalance),
    owedToYou: ft ? fromMoney(ft.owedToYou) : 0, youOwe: ft ? fromMoney(ft.youOwe) : 0,
  };
}

export interface CashflowDto { currency: string; points: { year: number; month: number; income: MoneyDto; expense: MoneyDto; net: MoneyDto }[] }

export function toCashflow(c: CashflowDto, locale: string): CashflowPoint[] {
  return c.points.map((p) => ({
    year: p.year, month: p.month,
    label: new Date(p.year, p.month - 1, 1).toLocaleDateString(locale, { month: "short" }),
    income: fromMoney(p.income), expense: fromMoney(p.expense), net: fromMoney(p.net),
  }));
}

export interface SpendingPaceDto {
  year: number; month: number; daysInMonth: number; elapsedDays: number; isCurrentMonth: boolean;
  days: { day: number; spent: MoneyDto; cumulative: MoneyDto }[];
  previous: { year: number; month: number; cumulative: MoneyDto[] };
  budgetTotal: MoneyDto | null;
  projection: null | {
    method: "history" | "pace"; basisMonths: number; expected: MoneyDto; low: MoneyDto; high: MoneyDto;
    days: { day: number; expected: MoneyDto; low: MoneyDto; high: MoneyDto }[];
  };
}

export function toSpendingPace(d: SpendingPaceDto): SpendingPace {
  return {
    year: d.year, month: d.month, daysInMonth: d.daysInMonth, elapsedDays: d.elapsedDays, isCurrentMonth: d.isCurrentMonth,
    days: d.days.map((x) => ({ day: x.day, spent: fromMoney(x.spent), cumulative: fromMoney(x.cumulative) })),
    previousMonth: `${d.previous.year}-${String(d.previous.month).padStart(2, "0")}`,
    previous: d.previous.cumulative.map(fromMoney),
    budgetTotal: d.budgetTotal ? fromMoney(d.budgetTotal) : null,
    projection: d.projection && {
      method: d.projection.method, basisMonths: d.projection.basisMonths,
      expected: fromMoney(d.projection.expected), low: fromMoney(d.projection.low), high: fromMoney(d.projection.high),
      days: d.projection.days.map((x) => ({ day: x.day, expected: fromMoney(x.expected), low: fromMoney(x.low), high: fromMoney(x.high) })),
    },
  };
}
