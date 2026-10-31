import type { PlanSummary } from "@/lib/utils/budgetPlan";
import { shareOf } from "@/lib/utils/budgetPlan";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export interface BarSegment {
  id: number;
  name: string;
  color: string;
  limit: number;
  spent: number;
}

const tint = (color: string) => `color-mix(in srgb, ${color} 24%, var(--paper-raised))`;

/** The whole monthly budget in one bar: one segment per category, as wide as its limit, filled by what is spent.
 *  Changing a limit anywhere changes this live; a segment selects its category. */
export function TotalBudgetBar({
  segments,
  summary,
  selectedId,
  onSelect,
}: {
  segments: BarSegment[];
  summary: PlanSummary;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const changed = Math.abs(summary.delta) >= 0.5;
  const spentPct = summary.total > 0 ? Math.round((summary.spent / summary.total) * 100) : 0;
  return (
    <section aria-label="Total monthly budget" className="rounded-2xl border border-line bg-paper-raised p-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">Total monthly budget</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span data-testid="plan-total" className="text-[26px] font-semibold tabular-nums">{formatCurrency(summary.total)}</span>
            {changed && (
              <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[12px] font-semibold text-warn">
                {summary.delta > 0 ? "+" : "−"}{formatCurrency(Math.abs(summary.delta))} unsaved
              </span>
            )}
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-7 gap-y-2 text-[12.5px]">
          <Stat label="Spent so far" value={formatCurrency(summary.spent)} hint={`${spentPct}% of budget`} />
          <Stat label="Left to spend" value={formatCurrency(summary.left)} tone="text-accent" />
          <Stat label="Spending with no budget" value={formatCurrency(summary.unbudgeted)} tone="text-warn" />
        </dl>
      </div>

      {segments.length === 0 ? (
        <p className="text-[13px] text-ink-soft">No budgets yet. Pick a category and set a limit to start the plan.</p>
      ) : (
        <div className="flex gap-1" role="group" aria-label="Where the total budget goes">
          {segments.map((s) => {
            const p = s.limit > 0 ? (s.spent / s.limit) * 100 : 0;
            const on = s.id === selectedId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                aria-pressed={on}
                aria-label={`${s.name}: budget ${formatCurrency(s.limit)}, ${Math.round(p)}% used`}
                title={`${s.name}: ${formatCurrency(s.spent)} of ${formatCurrency(s.limit)}`}
                className={cn("min-w-[34px] rounded-[8px] text-left transition-opacity", selectedId !== null && !on && "opacity-60 hover:opacity-100")}
                style={{ flex: `${s.limit} 1 0` }}
              >
                <span
                  className={cn("relative block h-7 overflow-hidden rounded-[7px]", on && "outline-2 outline-offset-2 outline-ink")}
                  style={{ background: tint(s.color) }}
                >
                  <span className="block h-full" style={{ width: `${Math.min(100, p)}%`, background: p > 100 ? "var(--negative)" : s.color }} />
                </span>
                <span className="mt-1.5 block truncate text-[12px] font-semibold">{s.name}</span>
                <span className="block truncate text-[11.5px] text-ink-faint">{formatCurrency(s.limit)} · {shareOf(s.limit, summary.total)}%</span>
              </button>
            );
          })}
          {summary.unbudgeted > 0 && (
            <div className="min-w-[34px]" style={{ flex: `${Math.max(summary.total * 0.06, summary.unbudgeted * 0.5)} 1 0` }}>
              <span
                aria-hidden
                className="block h-7 rounded-[7px] border border-dashed border-warn"
                style={{ background: "repeating-linear-gradient(45deg, var(--warn-soft), var(--warn-soft) 6px, transparent 6px, transparent 12px)" }}
              />
              <span className="mt-1.5 block truncate text-[12px] font-semibold text-warn">No budget</span>
              <span className="block truncate text-[11.5px] text-warn">{formatCurrency(summary.unbudgeted)} spent</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-faint">
        <Key className="bg-ink-soft" label="spent" />
        <Key className="bg-line-strong" label="still free" />
        <Key className="bg-negative" label="over its limit" />
      </div>
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className={cn("mt-0.5 text-[16px] font-semibold tabular-nums", tone)}>
        {value}
        {hint && <span className="ml-1.5 text-[12px] font-normal text-ink-faint">{hint}</span>}
      </dd>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-3.5 rounded-[2px]", className)} />
      {label}
    </span>
  );
}
