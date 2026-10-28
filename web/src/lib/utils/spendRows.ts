import type { BudgetStatus, CategoryTotal } from "@/types";

export interface SpendRow {
  id: number;
  name: string;
  color: string;
  spent: number;
  /** The category's budget, or null when it has none. */
  budget: number | null;
  notPaidBack: number;
}

/** Spending per category with its budget limit marked on the bar: a bar that passes the tick is over budget. */
export function buildSpendRows(spending: CategoryTotal[], budgets: BudgetStatus[], colorOf: (id: number) => string | undefined, limit = 7): SpendRow[] {
  const byId = new Map(budgets.map((b) => [b.categoryId, b]));
  const rows: SpendRow[] = spending
    .filter((c) => c.total > 0 || byId.has(c.categoryId))
    .map((c) => {
      const b = byId.get(c.categoryId);
      return { id: c.categoryId, name: c.categoryName, color: colorOf(c.categoryId) ?? "#5a5a5a", spent: c.total, budget: b ? b.budget : null, notPaidBack: b?.notPaidBack ?? 0 };
    });
  return rows.sort((a, b) => b.spent - a.spent).slice(0, limit);
}
