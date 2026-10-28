import type { SpendingPace as Pace } from "@/types";
import { formatCurrency } from "@/lib/utils/format";

/** The sentence above the chart: where the month stands, from the same numbers the chart draws. */
export function paceHeadline(p: Pace, monthName: string): { text: string; tone: "good" | "bad" | "plain" } {
  const spent = p.days.length ? p.days[p.days.length - 1].cumulative : 0;
  const budget = p.budgetTotal;
  if (p.isCurrentMonth && p.projection) {
    const lead = p.projection.method === "history" ? "On pace to spend about" : "At this pace you'll spend about";
    const end = formatCurrency(p.projection.expected);
    if (budget == null) return { text: `${lead} ${end} this month`, tone: "plain" };
    const gap = budget - p.projection.expected;
    return gap >= 0
      ? { text: `${lead} ${end}, ${formatCurrency(gap)} under your ${formatCurrency(budget)} budget`, tone: "good" }
      : { text: `${lead} ${end}, ${formatCurrency(-gap)} over your ${formatCurrency(budget)} budget`, tone: "bad" };
  }
  if (p.isCurrentMonth) {
    if (budget == null) return { text: `${formatCurrency(spent)} spent so far this month`, tone: "plain" };
    return { text: `${formatCurrency(spent)} spent so far, of your ${formatCurrency(budget)} budget`, tone: spent > budget ? "bad" : "plain" };
  }
  if (budget == null) return { text: `You spent ${formatCurrency(spent)} in ${monthName}`, tone: "plain" };
  const gap = budget - spent;
  return gap >= 0
    ? { text: `You spent ${formatCurrency(spent)} in ${monthName}, ${formatCurrency(gap)} under budget`, tone: "good" }
    : { text: `You spent ${formatCurrency(spent)} in ${monthName}, ${formatCurrency(-gap)} over budget`, tone: "bad" };
}
