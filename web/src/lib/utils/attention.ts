import type { Account, BudgetStatus, FriendBalance } from "@/types";
import { formatCurrency } from "@/lib/utils/format";

export interface AttentionItem {
  id: string;
  level: "warn" | "info";
  title: string;
  detail?: string;
  /** Where tapping it should go. */
  to?: string;
}

/** Whole days from `today` to the next time a monthly `day` comes round (a 31st clamps to a short month's last day). */
export function daysUntilDayOfMonth(day: number, today: Date): number {
  const at = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = at(start.getFullYear(), start.getMonth());
  if (next < start) next = at(start.getFullYear(), start.getMonth() + 1);
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

const BUDGET_WARN_AT = 80; // percent of a budget used
const STATEMENT_SOON_DAYS = 3;
const CARD_USED_WARN_AT = 80; // percent of the credit limit

/**
 * What deserves a look right now, worked out only from numbers the app already has: budgets close to or over
 * their limit, wallets below zero, a credit card near its limit or about to issue a statement, and money
 * between you and your friends. Warnings come first.
 */
export function buildAttention({ budgets, accounts, friendBalances, today }: {
  budgets: BudgetStatus[];
  accounts: Account[];
  friendBalances: FriendBalance[];
  today: Date;
}): AttentionItem[] {
  const out: AttentionItem[] = [];

  for (const b of budgets) {
    if (b.overBudget) {
      out.push({ id: `budget-${b.categoryId}`, level: "warn", title: `${b.categoryName} is over budget`, detail: `${formatCurrency(Math.abs(b.remaining))} over its ${formatCurrency(b.budget)} limit`, to: "/reports" });
    } else if (b.percentageUsed >= BUDGET_WARN_AT) {
      out.push({ id: `budget-${b.categoryId}`, level: "warn", title: `${b.categoryName} is at ${Math.round(b.percentageUsed)}% of its budget`, detail: `${formatCurrency(b.remaining)} left this month`, to: "/reports" });
    }
  }

  for (const a of accounts) {
    if (!a.isActive) continue;
    if (a.accountType === "ASSET" && a.balance < 0) {
      out.push({ id: `neg-${a.id}`, level: "warn", title: `${a.name} is below zero`, detail: `Balance ${formatCurrency(a.balance)} — check for a missing deposit or transfer`, to: "/accounts" });
    }
    if (a.accountType === "LIABILITY") {
      if (a.creditLimit && a.creditLimit > 0) {
        const used = (a.balance / a.creditLimit) * 100;
        if (used >= CARD_USED_WARN_AT) {
          out.push({ id: `limit-${a.id}`, level: "warn", title: `${a.name}: ${Math.round(used)}% of the limit used`, detail: `${formatCurrency(Math.max(a.creditLimit - a.balance, 0))} still available`, to: "/accounts" });
        }
      }
      if (a.statementDay && a.balance > 0) {
        const days = daysUntilDayOfMonth(a.statementDay, today);
        if (days <= STATEMENT_SOON_DAYS) {
          out.push({ id: `stmt-${a.id}`, level: "info", title: `${a.name} statement ${days === 0 ? "is today" : days === 1 ? "is tomorrow" : `is in ${days} days`}`, detail: `${formatCurrency(a.balance)} owed so far`, to: "/accounts" });
        }
      }
    }
  }

  for (const f of [...friendBalances].sort((x, y) => Math.abs(y.balance) - Math.abs(x.balance))) {
    if (f.balance < 0) {
      out.push({ id: `owe-${f.friendId}`, level: "warn", title: `You owe ${f.friendName} ${formatCurrency(-f.balance)}`, detail: f.frontedUnpaid > 0 ? `${formatCurrency(f.frontedUnpaid)} of it is spending they paid for you` : undefined, to: "/friends" });
    } else if (f.balance > 0) {
      out.push({ id: `owed-${f.friendId}`, level: "info", title: `${f.friendName} owes you ${formatCurrency(f.balance)}`, to: "/friends" });
    }
  }

  return [...out.filter((i) => i.level === "warn"), ...out.filter((i) => i.level === "info")];
}
