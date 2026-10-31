import type { BudgetHistoryRow } from "@/types";
import { formatCurrency } from "@/lib/utils/format";

/** Arithmetic for the budget plan on the Categories page. Money is in major units, for display only:
 *  the server stores and checks every limit; this only shows what the total would be. */

/** How much one tap on − or + moves a limit. */
export const BUDGET_STEP = 500;

export interface PlanItem {
  id: number;
  /** Spent this month. */
  spent: number;
  /** The limit as saved; null for no budget. */
  saved: number | null;
  /** The limit as it would be if the changes were saved. */
  limit: number | null;
}

export interface PlanSummary {
  total: number;
  savedTotal: number;
  /** total - savedTotal: what saving would add (or remove). */
  delta: number;
  /** Spent in categories that have a limit. */
  spent: number;
  /** Room that is really left: an overspent category does not free money for the others. */
  left: number;
  /** Spent in categories with no limit at all. */
  unbudgeted: number;
}

export function planSummary(items: PlanItem[]): PlanSummary {
  let total = 0;
  let savedTotal = 0;
  let spent = 0;
  let left = 0;
  let unbudgeted = 0;
  for (const i of items) {
    savedTotal += i.saved ?? 0;
    if (i.limit === null) {
      unbudgeted += i.spent;
      continue;
    }
    total += i.limit;
    spent += i.spent;
    left += Math.max(0, i.limit - i.spent);
  }
  return { total, savedTotal, delta: total - savedTotal, spent, left, unbudgeted };
}

/** The limit after a tap on − (-1) or + (1). From no limit, + starts at `start`; − never goes below one step. */
export function nextLimit(limit: number | null, direction: 1 | -1, start: number): number | null {
  if (limit === null) return direction === 1 ? start : null;
  return Math.max(BUDGET_STEP, limit + direction * BUDGET_STEP);
}

/** A tidy first limit for a category with none: the server's suggestion if there is one, else this
 *  month's spending rounded up to a step. */
export function startingLimit(spent: number, suggested?: number | null): number {
  if (suggested && suggested > 0) return suggested;
  return Math.max(BUDGET_STEP, Math.ceil(spent / BUDGET_STEP) * BUDGET_STEP);
}

/** Percent of the whole plan a limit takes, 0 when there is no plan. */
export function shareOf(limit: number, total: number): number {
  return total > 0 ? Math.round((limit / total) * 100) : 0;
}

/** What the history says about this limit, in one or two sentences. */
export function budgetAdvice(args: { limit: number | null; saved: number | null; history?: BudgetHistoryRow; average: number }): string {
  const { limit, saved, history, average } = args;
  if (limit !== saved) {
    return limit === null ? "The budget will be removed when you save." : `${saved === null ? "A new budget" : `Changed from ${formatCurrency(saved)}`}. The total moves with it.`;
  }
  if (limit === null) return average > 0 ? `No budget yet. You usually spend about ${formatCurrency(average)} a month here.` : "No budget yet, and nothing spent here lately.";
  if (!history || history.completeMonths < 3) return "Not enough history yet to judge this limit.";
  const base = history.monthsOver === 0 ? `Never over budget in the last ${history.completeMonths} months.` : `Over budget in ${history.monthsOver} of the last ${history.completeMonths} months.`;
  const s = history.suggestion;
  if (s.action === "raise") return `${base} A limit of ${formatCurrency(s.limit)} would have held in most of them.`;
  if (s.action === "tighten") return `${base} You could tighten this to ${formatCurrency(s.limit)} and free up ${formatCurrency(limit - s.limit)}.`;
  return `${base} Typical use is ${Math.round(history.typicalPct)}%, so this limit fits.`;
}
