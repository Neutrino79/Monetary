import { Link } from "react-router-dom";
import type { BudgetStatus } from "@/types";
import { formatCurrency } from "@/lib/utils/format";
import { budgetPace } from "@/lib/utils/budgetPace";
import { today } from "@/lib/utils/clock";

/**
 * One category's budget: spent / limit and a bar. Spend that a friend paid for you and you have not paid back
 * yet is drawn as a hatched slice at the end of the bar and called out underneath.
 */
export function BudgetBar({ b, month, large = false }: { b: BudgetStatus; month: string; large?: boolean }) {
  const pace = budgetPace(b.spent, b.budget, month, today());
  const left = b.budget - b.spent;
  const paceNote =
    pace.status === "over" ? `Over by ${formatCurrency(-left)}`
    : pace.status === "ahead" ? `Ahead of pace \u2014 on course for about ${formatCurrency(pace.projected ?? 0)}`
    : pace.status === "on-track" && pace.projected != null ? "On track for the month"
    : "";
  const used = Math.min(100, b.percentageUsed);
  const pending = b.budget > 0 ? Math.min(used, (b.notPaidBack / b.budget) * 100) : 0;
  const color = b.overBudget ? "var(--negative)" : b.percentageUsed > 80 ? "var(--warn)" : "var(--accent)";
  return (
    <div>
      <div className={`mb-1.5 flex items-baseline justify-between gap-2 ${large ? "text-body" : "text-caption"}`}>
        <Link
          to={`/expenses?category=${b.categoryId}&month=${month}`}
          className={`truncate hover:underline ${large ? "font-medium" : ""}`}
          aria-label={`${b.categoryName} expenses for ${month}`}
        >
          {b.categoryName}
        </Link>
        <span className={`flex-none ledger-figure ${b.overBudget ? "text-negative" : "text-ink-soft"}`}>
          {left >= 0 ? `${formatCurrency(left)} left` : `${formatCurrency(-left)} over`}
        </span>
      </div>
      <div
        className={`flex overflow-hidden rounded-full bg-paper-sunken ${large ? "h-2.5" : "h-2"}`}
        role="img"
        aria-label={`${b.categoryName}: ${Math.round(b.percentageUsed)}% of budget used${b.notPaidBack > 0 ? `, ${formatCurrency(b.notPaidBack)} not paid back yet` : ""}`}
      >
        <div className="h-full transition-[width]" style={{ width: `${used - pending}%`, background: color }} />
        {pending > 0 && (
          <div
            data-testid="not-paid-back-slice"
            className="h-full"
            style={{ width: `${pending}%`, background: `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)` }}
          />
        )}
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-micro text-ink-faint">
        <span>
          {formatCurrency(b.spent)} of {formatCurrency(b.budget)} · {Math.round(b.percentageUsed)}%
        </span>
        {paceNote && <span className={pace.status === "on-track" ? "text-accent" : pace.status === "ahead" ? "text-warn" : "text-negative"}>{paceNote}</span>}
      </div>
      {b.notPaidBack > 0 && (
        <div className="mt-1 text-micro text-info">{formatCurrency(b.notPaidBack)} of this is not paid back yet</div>
      )}
    </div>
  );
}
