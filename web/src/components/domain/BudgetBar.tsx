import type { BudgetStatus } from "@/types";
import { formatCurrency } from "@/lib/utils/format";

/**
 * One category's budget: spent / limit and a bar. Spend that a friend paid for you and you have not paid back
 * yet is drawn as a hatched slice at the end of the bar and called out underneath.
 */
export function BudgetBar({ b, showPercent = false, large = false }: { b: BudgetStatus; showPercent?: boolean; large?: boolean }) {
  const used = Math.min(100, b.percentageUsed);
  const pending = b.budget > 0 ? Math.min(used, (b.notPaidBack / b.budget) * 100) : 0;
  const color = b.overBudget ? "var(--negative)" : b.percentageUsed > 80 ? "var(--warn)" : "var(--accent)";
  return (
    <div>
      <div className={`mb-1.5 flex justify-between ${large ? "text-[13px]" : "text-[12.5px]"}`}>
        <span className={large ? "font-medium" : undefined}>{b.categoryName}</span>
        <span className={b.overBudget ? "text-negative" : "text-ink-soft"}>
          {formatCurrency(b.spent)} / {formatCurrency(b.budget)}
          {showPercent && ` (${Math.round(b.percentageUsed)}%)`}
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
      {b.notPaidBack > 0 && (
        <div className="mt-1 text-[11.5px] text-info">{formatCurrency(b.notPaidBack)} of this is not paid back yet</div>
      )}
    </div>
  );
}
