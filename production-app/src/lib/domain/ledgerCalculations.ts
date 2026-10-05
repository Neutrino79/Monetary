/**
 * Pure ledger math — balances, spend-by-category, net worth, friend
 * outstanding, budget usage, month buckets. Every function here takes the
 * data it needs as plain arguments rather than reaching into a singleton,
 * so it works identically whether that data came from the mock backend or
 * a real one. `hooks/useLedgerCalc.ts` is what binds these to live query
 * data inside components.
 */
import type { Account, BudgetUsage, Category, DateRange, Friend, IncomeSource, MonthBucket, NetWorth, Transaction } from "@/types";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- lookups
export function getAccount(accounts: Account[], id: string | undefined): Account | undefined {
  return id ? accounts.find((a) => a.id === id) : undefined;
}
export function getCategory(categories: Category[], incomeSources: IncomeSource[], id: string | undefined): Category | IncomeSource | undefined {
  if (!id) return undefined;
  return categories.find((c) => c.id === id) ?? incomeSources.find((s) => s.id === id);
}
export function getFriend(friends: Friend[], id: string | undefined): Friend | undefined {
  return id ? friends.find((f) => f.id === id) : undefined;
}
export function categoryChildren(categories: Category[], id: string): Category[] {
  return categories.filter((c) => c.parentId === id);
}
export function categoryRoots(categories: Category[]): Category[] {
  return categories.filter((c) => !c.parentId);
}
export function activeTxns(transactions: Transaction[], extra?: (t: Transaction) => boolean): Transaction[] {
  return transactions.filter((t) => t.status !== "reversed" && (!extra || extra(t)));
}

// ------------------------------------------------------------- calculators
export function calcAccountBalance(accounts: Account[], transactions: Transaction[], accountId: string, asOfDate?: string): number {
  const acc = getAccount(accounts, accountId);
  if (!acc) return 0;
  let bal = acc.openingBalance || 0;
  activeTxns(transactions, (t) => !asOfDate || t.date <= asOfDate).forEach((t) => {
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

export function calcNetWorth(accounts: Account[], transactions: Transaction[]): NetWorth {
  let assets = 0;
  let liabilities = 0;
  accounts.filter((a) => a.isActive && !a.isSystem).forEach((a) => {
    const b = calcAccountBalance(accounts, transactions, a.id);
    if (a.accountType === "ASSET") assets += b;
    if (a.accountType === "LIABILITY") liabilities += b;
  });
  return { assets: round2(assets), liabilities: round2(liabilities), net: round2(assets - liabilities) };
}

export function calcFriendOutstanding(transactions: Transaction[], friendId: string): number {
  let bal = 0;
  activeTxns(transactions).forEach((t) => {
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

export function calcCategorySpend(categories: Category[], transactions: Transaction[], categoryId: string, range?: DateRange): number {
  const kids = categoryChildren(categories, categoryId).map((c) => c.id);
  const ids = new Set([categoryId, ...kids]);
  let total = 0;
  activeTxns(transactions, (t) => !range || (t.date >= range.from && t.date <= range.to)).forEach((t) => {
    if (t.type === "expense" && ids.has(t.categoryId ?? "")) total += t.amount;
    if (t.type === "split" && ids.has(t.categoryId ?? "")) total += t.yourShare ?? t.amount;
    if (t.type === "refund" && ids.has(t.categoryId ?? "")) total -= t.amount;
  });
  return round2(total);
}

export function calcTotalExpenses(transactions: Transaction[], range?: DateRange): number {
  let total = 0;
  activeTxns(transactions, (t) => !range || (t.date >= range.from && t.date <= range.to)).forEach((t) => {
    if (t.type === "expense") total += t.amount;
    if (t.type === "split") total += t.yourShare ?? t.amount;
    if (t.type === "refund") total -= t.amount;
  });
  return round2(total);
}

export function calcTotalIncome(transactions: Transaction[], range?: DateRange): number {
  let total = 0;
  activeTxns(transactions, (t) => (!range || (t.date >= range.from && t.date <= range.to)) && t.type === "income").forEach((t) => (total += t.amount));
  return round2(total);
}

export function calcBudgetUsage(categories: Category[], transactions: Transaction[], range?: DateRange): BudgetUsage[] {
  return categoryRoots(categories)
    .filter((c) => c.budgetLimit != null)
    .map((c) => {
      const spent = calcCategorySpend(categories, transactions, c.id, range);
      return { category: c, spent, limit: c.budgetLimit as number, pct: round2((spent / (c.budgetLimit as number)) * 100) };
    });
}

export function monthRange(anchorDate: string, monthsBack: number): DateRange {
  const end = new Date(anchorDate);
  const start = new Date(end);
  start.setMonth(start.getMonth() - monthsBack);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function lastNMonthsBuckets(anchorDate: string, n: number, locale: string): MonthBucket[] {
  const end = new Date(anchorDate);
  const buckets: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const from = d.toISOString().slice(0, 10);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    buckets.push({
      label: d.toLocaleDateString(locale, { month: "short" }),
      key: from.slice(0, 7),
      from,
      to: to > anchorDate ? anchorDate : to,
    });
  }
  return buckets;
}
