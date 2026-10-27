import { useState } from "react";
import { Link } from "react-router-dom";
import type { CashflowPoint } from "@/types";
import { useInspect } from "@/hooks/useInspect";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const BAR_AREA = 160;

/**
 * Money in against money out for the last few months. Hover a month (or tap it on a phone) for the figures;
 * clicking it, or tapping again, opens that month's transactions.
 */
export function MonthlyBars({ points }: { points: CashflowPoint[] }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const inspect = useInspect<string>(undefined, root);
  const peak = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]));
  const key = (p: CashflowPoint) => `${p.year}-${String(p.month).padStart(2, "0")}`;
  const height = (v: number) => Math.max(v > 0 ? 3 : 0, Math.round((v / peak) * BAR_AREA));

  return (
    <div ref={setRoot}>
      <ul className="flex items-end gap-1.5 pt-16 sm:gap-2.5" aria-label="Income and expenses by month">
        {points.map((p, i) => {
          const k = key(p);
          const on = inspect.active === k;
          const edge = i === 0 ? "left-0" : i >= points.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <li key={k} className="relative min-w-0 flex-1">
              <Link
                to={`/transactions?month=${k}`}
                aria-label={`${p.label} ${p.year}: in ${formatCurrency(p.income)}, out ${formatCurrency(p.expense)}`}
                {...inspect.itemProps(k)}
                className={cn("flex flex-col items-center justify-end gap-2 rounded-[8px] pb-1 transition-opacity", inspect.active && !on && "opacity-45")}
              >
                <span className="flex items-end gap-1" style={{ height: BAR_AREA }}>
                  <span className="w-3 rounded-t-[5px] bg-accent sm:w-[18px]" style={{ height: height(p.income) }} />
                  <span className="w-3 rounded-t-[5px] bg-line-strong sm:w-[18px]" style={{ height: height(p.expense) }} />
                </span>
                <span className="text-[12px] text-ink-soft">{p.label}</span>
              </Link>
              {on && (
                <div role="status" data-testid="bars-tooltip" className={cn("pointer-events-none absolute z-10 whitespace-nowrap rounded-[8px] bg-ink px-3 py-2 text-[12px] leading-relaxed text-paper", edge)} style={{ bottom: Math.max(height(p.income), height(p.expense)) + 40 }}>
                  <div className="font-semibold">{new Date(p.year, p.month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
                  <div>In {formatCurrency(p.income)}</div>
                  <div>Out {formatCurrency(p.expense)}</div>
                  <div>{p.net >= 0 ? "Saved" : "Overspent"} {formatCurrency(Math.abs(p.net))}</div>
                  {inspect.touch && <div className="opacity-75">Tap again to open</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-4 text-[12.5px] text-ink-soft">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-accent" />In</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-line-strong" />Out</span>
      </div>
    </div>
  );
}
