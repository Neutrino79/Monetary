/**
 * How a budget is going against the calendar. Presentation only: spent and budget come from the API;
 * this just compares them with how much of the month has passed.
 */
export type PaceStatus = "over" | "ahead" | "on-track" | "finished";

export interface BudgetPace {
  status: PaceStatus;
  /** Share of the month that has passed, 0-100 (100 for a finished month). */
  elapsedPct: number;
  /** Spend at the end of the month if the pace so far continues (current month only). */
  projected: number | null;
}

/** `month` is 'YYYY-MM'; `todayIso` is 'YYYY-MM-DD'. Past months are "finished", future ones "on-track". */
export function budgetPace(spent: number, budget: number, month: string, todayIso: string): BudgetPace {
  const todayMonth = todayIso.slice(0, 7);
  if (month < todayMonth) return { status: spent > budget ? "over" : "finished", elapsedPct: 100, projected: null };
  if (month > todayMonth) return { status: "on-track", elapsedPct: 0, projected: null };
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const day = Number(todayIso.slice(8, 10));
  const elapsedPct = (day / daysInMonth) * 100;
  const projected = day > 0 ? (spent / day) * daysInMonth : spent;
  if (spent > budget) return { status: "over", elapsedPct, projected };
  // a little slack: only call it "ahead" once the projection clearly overshoots the limit
  return { status: projected > budget * 1.05 ? "ahead" : "on-track", elapsedPct, projected };
}

/** Round a spend figure up to a tidy budget suggestion (nearest 500, or 100 for small amounts). */
export function suggestBudget(spend: number): number {
  if (spend <= 0) return 0;
  const step = spend < 2000 ? 100 : 500;
  return Math.ceil(spend / step) * step;
}
