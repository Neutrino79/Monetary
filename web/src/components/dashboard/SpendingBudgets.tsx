import { Link } from "react-router-dom";
import type { SpendRow } from "@/lib/utils/spendRows";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function SpendingBudgets({ rows, month }: { rows: SpendRow[]; month: string }) {
  const unbudgetedPeak = Math.max(1, ...rows.map((r) => r.spent));
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => {
        const pct = r.budget ? (r.spent / r.budget) * 100 : null;
        const over = pct != null && pct > 100;
        const tone = pct == null ? "text-ink-faint" : over ? "text-negative" : pct > 80 ? "text-warn" : "text-accent";
        const fill = pct == null ? r.color : over ? "var(--negative)" : pct > 80 ? "var(--warn)" : "var(--accent)";
        const scale = r.budget ? r.budget * 1.25 : unbudgetedPeak;
        return (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[13.5px] sm:grid-cols-[8.5rem_minmax(0,1fr)_7.5rem]">
            <Link to={`/expenses?category=${r.id}&month=${month}`} aria-label={`${r.name} expenses for ${month}`} className="flex min-w-0 items-center gap-2 hover:underline">
              <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: r.color }} />
              <span className="truncate">{r.name}</span>
            </Link>
            <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
              <span className="relative block h-2 rounded-full bg-paper-sunken" role="img" aria-label={pct == null ? `${r.name}: no budget set` : `${r.name}: ${Math.round(pct)}% of budget used`}>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (r.spent / scale) * 100)}%`, background: fill }} />
                {r.budget != null && <span aria-hidden className="absolute -inset-y-1 left-[80%] w-0.5 bg-ink" />}
              </span>
            </span>
            <span className="order-2 text-right sm:order-none">
              <span className="ledger-figure text-[15px]">{formatCurrency(r.spent)}</span>
              <span className={cn("block text-[11.5px] font-semibold", tone)}>
                {r.budget == null ? "no limit" : over ? `over by ${formatCurrency(r.spent - r.budget)}` : `${Math.round(pct ?? 0)}% of limit`}
              </span>
            </span>
            {r.notPaidBack > 0 && <span className="order-4 col-span-2 text-[11.5px] text-info sm:col-start-2 sm:col-span-2">{formatCurrency(r.notPaidBack)} paid by a friend, not repaid yet</span>}
          </li>
        );
      })}
    </ul>
  );
}
