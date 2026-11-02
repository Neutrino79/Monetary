import { formatCurrency } from "@/lib/utils/format";
import { monthLabel } from "@/lib/utils/dateRange";

/** "↑ ₹4,200 (12%) vs Sep" under a monthly figure. `upIsGood` colours the change (spending up is not good). */
export function VsLastMonth({ current, previous, previousMonth, upIsGood }: { current: number; previous: number | undefined; previousMonth: string; upIsGood: boolean }) {
  if (previous === undefined) return null;
  const label = monthLabel(previousMonth).split(" ")[0];
  const diff = current - previous;
  if (previous === 0 && current === 0) return null;
  if (Math.abs(diff) < 0.5) return <div className="text-micro text-ink-faint">Same as {label}</div>;
  const pct = previous > 0 ? ` (${Math.round((Math.abs(diff) / previous) * 100)}%)` : "";
  const good = diff > 0 === upIsGood;
  return (
    <div className={`text-micro ${good ? "text-accent" : "text-negative"}`} data-testid="vs-last-month">
      {diff > 0 ? "↑" : "↓"} {formatCurrency(Math.abs(diff))}{pct} vs {label}
    </div>
  );
}
