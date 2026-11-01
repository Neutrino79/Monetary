import { Link } from "react-router-dom";
import type { Overview, OverviewMonth } from "@/types";
import { BarChart3 } from "lucide-react";
import { Card, EmptyState, LoadFailed } from "@/components/ui/primitives";
import { SkeletonReport } from "@/components/ui/skeletons";
import { useOverview } from "@/hooks/queries";
import { formatCurrency } from "@/lib/utils/format";
import { findingText, monthKey, monthLong, signedPct } from "@/lib/utils/reportText";
import { monthLink } from "@/lib/utils/reportLinks";
import { CashflowChart, IncomeMixChart, NetWorthChart } from "./OverviewCharts";
import { Sparkline } from "./Sparkline";
import { cn } from "@/lib/utils/cn";

function Kpi({ label, value, delta, goodWhenUp, series, previous, color }: { label: string; value: string; delta: string | null; goodWhenUp: boolean | null; series: number[]; previous?: number[]; color: string }) {
  const up = delta?.startsWith("+");
  const down = delta?.startsWith("−");
  const tone = goodWhenUp === null || (!up && !down) ? "text-ink-faint" : (up === goodWhenUp ? "text-accent" : "text-negative");
  return (
    <div className="min-w-0 rounded-card border border-line bg-paper-raised p-3.5">
      <div className="text-caption text-ink-faint">{label}</div>
      <div className="mt-1 truncate text-[19px] font-semibold tabular-nums">{value}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className={cn("text-caption font-medium", tone)}>{delta ? `${delta} vs before` : "no earlier data"}</span>
        <Sparkline values={series} previous={previous} color={color} width={64} height={24} />
      </div>
    </div>
  );
}

const delta = (now: number, before: number) => (before === 0 ? null : signedPct(((now - before) / Math.abs(before)) * 100));

function Kpis({ o }: { o: Overview }) {
  const complete = o.points.filter((p) => !p.isPartial);
  const prev = o.previousPoints;
  const nw = o.netWorth;
  const nwNow = nw[nw.length - 1]?.netWorth ?? 0;
  const nwThen = nw[0]?.netWorth ?? 0;
  const rate = (arr: { savingsRate: number | null }[]) => arr.map((p) => p.savingsRate ?? 0);
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Kpi label="Income / month" value={formatCurrency(o.current.averageIncome)} delta={delta(o.current.averageIncome, o.previous.averageIncome)} goodWhenUp series={o.points.map((p) => p.income)} previous={prev.map((p) => p.income)} color="var(--accent)" />
      <Kpi label="Spending / month" value={formatCurrency(o.current.averageExpense)} delta={delta(o.current.averageExpense, o.previous.averageExpense)} goodWhenUp={false} series={o.points.map((p) => p.expense)} previous={prev.map((p) => p.expense)} color="var(--negative)" />
      <Kpi label="Kept" value={formatCurrency(o.current.net)} delta={delta(o.current.net, o.previous.net)} goodWhenUp series={o.points.map((p) => p.net)} previous={prev.map((p) => p.net)} color="var(--accent)" />
      <Kpi label="Savings rate" value={o.current.savingsRate === null ? "—" : `${Math.round(o.current.savingsRate)}%`} delta={o.current.savingsRate === null || o.previous.savingsRate === null ? null : signedPct(o.current.savingsRate - o.previous.savingsRate) .replace("%", " pts")} goodWhenUp series={rate(complete)} previous={rate(prev)} color="var(--info)" />
      <Kpi label="Net worth" value={formatCurrency(nwNow)} delta={delta(nwNow, nwThen)} goodWhenUp series={nw.map((p) => p.netWorth)} color="var(--accent)" />
    </div>
  );
}

function BestWorst({ months }: { months: OverviewMonth[] }) {
  const done = months.filter((m) => !m.isPartial);
  if (done.length < 2) return null;
  const sorted = [...done].sort((a, b) => b.net - a.net);
  const best = sorted.slice(0, 2);
  const worst = sorted.slice(-2).reverse();
  const Row = ({ m }: { m: OverviewMonth }) => (
    <li className="flex items-center justify-between py-1.5 text-body">
      <span>{monthLong(m)} {m.year}</span>
      <span className={cn("font-medium tabular-nums", m.net < 0 ? "text-negative" : "text-accent")}>{formatCurrency(m.net)}</span>
    </li>
  );
  return (
    <Card>
      <div className="text-lead font-semibold">Best and worst months</div>
      <div className="mb-2 text-caption text-ink-faint">By what you kept, complete months only.</div>
      <div className="grid gap-x-8 sm:grid-cols-2">
        <div><div className="text-caption font-semibold text-ink-soft">Kept the most</div><ul>{best.map((m) => <Row key={`${m.year}${m.month}`} m={m} />)}</ul></div>
        <div><div className="text-caption font-semibold text-ink-soft">Kept the least</div><ul>{worst.map((m) => <Row key={`${m.year}${m.month}`} m={m} />)}</ul></div>
      </div>
    </Card>
  );
}

export function OverviewTab({ months }: { months: number }) {
  const q = useOverview(months);
  if (q.isLoading) return <SkeletonReport />;
  const o = q.data;
  if (q.isError || !o) return <LoadFailed what="the overview" error={q.error} onRetry={() => q.refetch()} />;
  if (o.points.every((p) => p.income === 0 && p.expense === 0)) return <EmptyState icon={BarChart3} title="Nothing to analyse yet" description="Add a few transactions and this page fills in." />;
  return (
    <div className="space-y-5">
      <Kpis o={o} />
      <Card>
        <div className="text-lead font-semibold">Money in and out</div>
        <div className="mb-3 text-caption text-ink-faint">Each month against a 3-month rolling average of spending.</div>
        <CashflowChart points={o.points} />
      </Card>
      {o.findings.length > 0 && (
        <Card>
          <div className="mb-2 text-lead font-semibold">What the numbers say</div>
          <ul className="divide-y divide-dashed divide-line">
            {o.findings.map((f, i) => {
              const t = findingText(f);
              return (
                <li key={i} className="flex gap-3 py-2.5">
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", f.tone === "good" ? "bg-accent" : f.tone === "watch" ? "bg-warn" : "bg-ink-faint")} />
                  <div>
                    <div className="text-body font-medium">{t.title}</div>
                    <div className="text-caption text-ink-soft">{t.body}</div>
                    {f.code === "unusual_months" && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {f.flagged.map((m) => <Link key={monthKey(m)} to={monthLink(monthKey(m))} className="rounded-full border border-line px-2.5 py-0.5 text-caption font-medium text-accent hover:bg-paper-sunken">See {monthLong(m)}'s transactions</Link>)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {o.netWorth.length > 1 && (
        <Card>
          <div className="text-lead font-semibold">Net worth</div>
          <div className="mb-3 text-caption text-ink-faint">What you own minus what you owe, at each month end.</div>
          <NetWorthChart points={o.netWorth} />
        </Card>
      )}
      {o.incomeSources.length > 0 && (
        <Card>
          <div className="text-lead font-semibold">Where income comes from</div>
          <div className="mb-3 text-caption text-ink-faint">Stacked by source.</div>
          <IncomeMixChart months={o.points} sources={o.incomeSources} />
        </Card>
      )}
      <BestWorst months={o.points} />
    </div>
  );
}
