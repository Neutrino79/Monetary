import type { Account, Category, IncomeSource, Friend, Transaction, DateRange, MonthBucket, BudgetUsage, NetWorth } from "@/types";
import { ACCOUNTS, CATEGORIES, INCOME_SOURCES, FRIENDS, buildTransactions } from "./seed";

/**
 * The mock data set is anchored to a fixed date so the generated history is
 * deterministic and reproducible. Centralized here rather than hardcoded as
 * a literal string throughout the app — swapping to a real backend later
 * just means this becomes `() => new Date()`.
 */
export const MOCK_TODAY = "2026-09-23";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The single in-memory "database" — mutated only by lib/api, read by hooks. */
class Database {
  accounts: Account[] = clone(ACCOUNTS);
  categories: Category[] = clone(CATEGORIES);
  incomeSources: IncomeSource[] = clone(INCOME_SOURCES);
  friends: Friend[] = clone(FRIENDS);
  transactions: Transaction[] = buildTransactions();

  reset() {
    this.accounts = clone(ACCOUNTS);
    this.categories = clone(CATEGORIES);
    this.incomeSources = clone(INCOME_SOURCES);
    this.friends = clone(FRIENDS);
    this.transactions = buildTransactions();
  }
}

export const db = new Database();

// ---------------------------------------------------------------- lookups
export function getAccount(id: string | undefined): Account | undefined {
  return id ? db.accounts.find((a) => a.id === id) : undefined;
}
export function getCategory(id: string | undefined): Category | IncomeSource | undefined {
  if (!id) return undefined;
  return db.categories.find((c) => c.id === id) ?? db.incomeSources.find((s) => s.id === id);
}
export function getFriend(id: string | undefined): Friend | undefined {
  return id ? db.friends.find((f) => f.id === id) : undefined;
}
export function categoryChildren(id: string): Category[] {
  return db.categories.filter((c) => c.parentId === id);
}
export function categoryRoots(): Category[] {
  return db.categories.filter((c) => !c.parentId);
}
export function activeTxns(extra?: (t: Transaction) => boolean): Transaction[] {
  return db.transactions.filter((t) => t.status !== "reversed" && (!extra || extra(t)));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------- calculators
export function calcAccountBalance(accountId: string, asOfDate?: string): number {
  const acc = getAccount(accountId);
  if (!acc) return 0;
  let bal = acc.openingBalance || 0;
  activeTxns((t) => !asOfDate || t.date <= asOfDate).forEach((t) => {
    const liab = acc.accountType === "LIABILITY";
    if ((t.type === "expense" || t.type === "split") && t.accountId === accountId) bal += liab ? t.amount : -t.amount;
    if (t.type === "income" && t.accountId === accountId) bal += t.amount;
    if (t.type === "transfer") {
      if (t.accountId === accountId) bal -= t.amount;
      if (t.toAccountId === accountId) bal += liab ? -t.amount : t.amount;
    }
    if (t.type === "settlement" && t.accountId === accountId) bal += t.direction === "receive" ? t.amount : -t.amount;
    if (t.type === "refund" && t.accountId === accountId) bal += liab ? -t.amount : t.amount;
    if (t.type === "adjustment" && t.accountId === accountId) bal += t.direction === "increase" ? t.amount : -t.amount;
  });
  return round2(bal);
}

export function calcNetWorth(): NetWorth {
  let assets = 0;
  let liabilities = 0;
  db.accounts.filter((a) => a.isActive && !a.isSystem).forEach((a) => {
    const b = calcAccountBalance(a.id);
    if (a.accountType === "ASSET") assets += b;
    if (a.accountType === "LIABILITY") liabilities += b;
  });
  return { assets: round2(assets), liabilities: round2(liabilities), net: round2(assets - liabilities) };
}

export function calcFriendOutstanding(friendId: string): number {
  let bal = 0;
  activeTxns().forEach((t) => {
    if (t.type === "split") {
      const s = t.splits?.find((sp) => sp.friendId === friendId);
      if (s) bal += round2(s.share - s.settled);
    }
    if (t.type === "settlement" && t.friendId === friendId) {
      bal += t.direction === "receive" ? -t.amount : t.amount;
    }
  });
  return round2(bal);
}

export function calcCategorySpend(categoryId: string, range?: DateRange): number {
  const kids = categoryChildren(categoryId).map((c) => c.id);
  const ids = new Set([categoryId, ...kids]);
  let total = 0;
  activeTxns((t) => !range || (t.date >= range.from && t.date <= range.to)).forEach((t) => {
    if (t.type === "expense" && ids.has(t.categoryId ?? "")) total += t.amount;
    if (t.type === "split" && ids.has(t.categoryId ?? "")) total += t.yourShare ?? t.amount;
    if (t.type === "refund" && ids.has(t.categoryId ?? "")) total -= t.amount;
  });
  return round2(total);
}

export function calcTotalExpenses(range?: DateRange): number {
  let total = 0;
  activeTxns((t) => !range || (t.date >= range.from && t.date <= range.to)).forEach((t) => {
    if (t.type === "expense") total += t.amount;
    if (t.type === "split") total += t.yourShare ?? t.amount;
    if (t.type === "refund") total -= t.amount;
  });
  return round2(total);
}

export function calcTotalIncome(range?: DateRange): number {
  let total = 0;
  activeTxns((t) => (!range || (t.date >= range.from && t.date <= range.to)) && t.type === "income").forEach((t) => (total += t.amount));
  return round2(total);
}

export function calcBudgetUsage(range?: DateRange): BudgetUsage[] {
  return categoryRoots()
    .filter((c) => c.budgetLimit != null)
    .map((c) => {
      const spent = calcCategorySpend(c.id, range);
      return { category: c, spent, limit: c.budgetLimit as number, pct: round2((spent / (c.budgetLimit as number)) * 100) };
    });
}

export function monthRange(monthsBack: number): DateRange {
  const end = new Date(MOCK_TODAY);
  const start = new Date(end);
  start.setMonth(start.getMonth() - monthsBack);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function lastNMonthsBuckets(n: number): MonthBucket[] {
  const end = new Date(MOCK_TODAY);
  const buckets: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const from = d.toISOString().slice(0, 10);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    buckets.push({
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      key: from.slice(0, 7),
      from,
      to: to > MOCK_TODAY ? MOCK_TODAY : to,
    });
  }
  return buckets;
}
