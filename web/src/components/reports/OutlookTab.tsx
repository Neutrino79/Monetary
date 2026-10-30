import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useOutlook } from "@/hooks/queries";
import { formatCurrency } from "@/lib/utils/format";
import { scenarioLine } from "@/lib/utils/outlookScenario";
import { monthLong } from "@/lib/utils/reportText";
import { FanChart } from "./FanChart";

export function OutlookTab({ months }: { months: number }) {
  const q = useOutlook(months);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  const o = q.data;
  if (q.isError || !o) return <EmptyState icon={BarChart3} title="Couldn't load the outlook" description="Try again in a moment." />;
  if (o.method === "none") return <EmptyState icon={BarChart3} title="Not enough history to look ahead" description="Three months of income and spending are needed before a forecast means anything." />;
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const scenario = picked.size > 0 ? scenarioLine(o.forecast, o.levers, picked) : null;
  const ye = o.yearEnd;
  const saved = o.levers.filter((l) => picked.has(l.categoryId)).reduce((a, l) => a + l.monthlySaving, 0);
  const endLabel = ye ? `${monthLong(ye.netWorth)} ${ye.netWorth.year}` : "";
  return (
    <div className="space-y-5">
      <Card>
        <div className="text-[14.5px] font-semibold">Where net worth is heading</div>
        <div className="mb-3 text-[12.5px] text-ink-faint">
          {o.method === "seasonal" ? "Each coming month repeats the same month last year, so big annual bills show up again." : "Based on your average month; a full year of history would let it follow the seasons."} Learned from {o.learnedFrom} complete months. Today: {formatCurrency(o.netWorthNow)}.
        </div>
        <FanChart o={o} scenario={scenario} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        {ye && (
          <Card>
            <div className="text-[14.5px] font-semibold">The year as it will probably end</div>
            <div className="mb-3 text-[12.5px] text-ink-faint">{ye.year} to {endLabel}, including the months already behind you.</div>
            <div className="text-[24px] font-semibold tabular-nums">{formatCurrency(ye.netWorth.expected)}</div>
            <div className="text-[12.5px] text-ink-soft">Likely between {formatCurrency(ye.netWorth.low)} and {formatCurrency(ye.netWorth.high)}</div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
              {([["Income", ye.income], ["Spending", ye.expense], ["Kept", ye.kept]] as const).map(([k, v]) => <div key={k}><dt className="text-ink-faint">{k}</dt><dd className="font-semibold tabular-nums">{formatCurrency(v)}</dd></div>)}
            </dl>
            {ye.savingsRate !== null && <div className="mt-2 text-[12.5px] text-ink-soft">Savings rate for the year: {Math.round(ye.savingsRate)}%</div>}
          </Card>
        )}
        <Card>
          <div className="text-[14.5px] font-semibold">What if I…</div>
          <div className="mb-2 text-[12.5px] text-ink-faint">Budgets you have been overshooting lately. Tick one to see the path if you held to it.</div>
          {o.levers.length === 0 ? <p className="text-[13px] text-ink-faint">No budget is running over its limit, so there is nothing to trim.</p> : (
            <ul className="divide-y divide-dashed divide-line">
              {o.levers.map((l) => (
                <li key={l.categoryId}>
                  <label className="flex cursor-pointer items-start gap-3 py-2.5">
                    <input type="checkbox" className="mt-1" checked={picked.has(l.categoryId)} onChange={() => toggle(l.categoryId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.3px] font-medium">Hold {l.name} to its {formatCurrency(l.limit)} limit</span>
                      <span className="block text-[12px] text-ink-faint">Typically {formatCurrency(l.typical)} lately · saves {formatCurrency(l.monthlySaving)} a month</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {scenario && ye && <p className="mt-2 text-[12.5px] font-medium text-info">That is {formatCurrency(saved)} a month, about {formatCurrency(saved * o.forecast.length)} more net worth after {o.forecast.length} months.</p>}
        </Card>
      </div>
    </div>
  );
}
