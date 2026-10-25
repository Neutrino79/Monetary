import type { Account } from "@/types";
import { daysUntilDayOfMonth } from "@/lib/utils/attention";

export interface CardStats {
  /** Credit still free: limit minus what is owed (never below zero). Null when no limit is set. */
  available: number | null;
  /** Share of the limit in use, 0-100+ (over 100 means past the limit). Null when no limit is set. */
  utilisationPct: number | null;
  /** Days until the next statement is issued; null when no statement day is set. */
  daysToStatement: number | null;
}

/** Display figures for a credit card, from the owed balance the API gives. */
export function cardStats(a: Pick<Account, "balance" | "creditLimit" | "statementDay">, today: Date): CardStats {
  const limit = a.creditLimit;
  return {
    available: limit != null && limit > 0 ? Math.max(0, limit - a.balance) : null,
    utilisationPct: limit != null && limit > 0 ? (a.balance / limit) * 100 : null,
    daysToStatement: a.statementDay != null ? daysUntilDayOfMonth(a.statementDay, today) : null,
  };
}

export function statementText(days: number): string {
  return days === 0 ? "Statement today" : days === 1 ? "Statement tomorrow" : `Statement in ${days} days`;
}
