import { useState } from "react";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
import type { CompareCategory, MonthSpan } from "@/types";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useCompare } from "@/hooks/queries";
import { formatCurrency } from "@/lib/utils/format";
import { comparePeriods, spanIsValid, spanLabel, type CompareBasis, type ReportRange } from "@/lib/utils/reportRange";
import { signedMoney, signedPct } from "@/lib/utils/reportText";
import { Waterfall, type Step } from "./Waterfall";
import { cn } from "@/lib/utils/cn";

type Basis = CompareBasis | "custom";
type SortKey = "name" | "b" | "a" | "change" | "pct" | "share";

function MonthInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
      {label}
      <input type="month" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-[8px] border border-line bg-paper-raised px-2 py-1 text-[12.5px] text-ink" />
    </label>
  );
}

function SpanInputs({ title, span, onChange }: { title: string; span: MonthSpan; onChange: (s: MonthSpan) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-[12px] font-semibold">{title}</span>
      <MonthInput label="from" value={span.from} onChange={(from) => onChange({ ...span, from })} />
      <MonthInput label="to" value={span.to} onChange={(to) => onChange({ ...span, to })} />
    </div>
  );
}

const sorters: Record<SortKey, (c: CompareCategory) => number | string> = {
  name: (c) => c.name.toLowerCase(),
  b: (c) => c.b,
  a: (c) => c.a,
  change: (c) => c.change,
  pct: (c) => c.changePct ?? 0,
  share: (c) => Math.abs(c.shareOfChangePct),
};

export function CompareTab({ range }: { range: ReportRange }) {
  const [basis, setBasis] = useState<Basis>("previous");
  const [custom, setCustom] = useState<{ a: MonthSpan; b: MonthSpan } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "change", dir: -1 });
  const preset = comparePeriods(range, basis === "custom" ? "previous" : basis);
  const periods = basis === "custom" ? (custom ?? preset) : preset;
  const valid = spanIsValid(periods.a) && spanIsValid(periods.b);
  const q = useCompare(periods.a, periods.b);
  const pickBasis = (b: Basis) => {
    if (b === "custom") setCustom(preset);
    setBasis(b);
  };
  const r = valid ? q.data : undefined;
  const aLabel = spanLabel(periods.a);
  const bLabel = spanLabel(periods.b);

  const rows = [...(r?.categories ?? [])].sort((x, y) => {
    const kx = sorters[sort.key](x);
    const ky = sorters[sort.key](y);
    return (kx < ky ? -1 : kx > ky ? 1 : 0) * sort.dir;
  });
  const bySize = [...(r?.categories ?? [])].filter((c) => c.change !== 0).sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
  const steps: Step[] = bySize.slice(0, 6).map((c) => ({ name: c.name, change: c.change }));
  const rest = bySize.slice(6).reduce((a, c) => a + c.change, 0);
  if (Math.abs(rest) > 0.5) steps.push({ name: "Other", change: rest });
  const head = (key: SortKey, label: string, cls = "") => (
    <th scope="col" className={cn("px-2 py-2 text-right font-semibold", cls)} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))} className="inline-flex items-center gap-0.5 hover:text-ink">
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
  const drivers = (key: "volumeEffect" | "ticketEffect") => [...(r?.categories ?? [])].filter((c) => Math.abs(c[key]) >= 1).sort((x, y) => Math.abs(y[key]) - Math.abs(x[key])).slice(0, 3);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Compare against">
          {(["previous", "year", "custom"] as const).map((b) => (
            <button key={b} type="button" aria-pressed={basis === b} onClick={() => pickBasis(b)} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-medium", basis === b ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised text-ink-soft hover:text-ink")}>
              {b === "previous" ? "Previous period" : b === "year" ? "Same period last year" : "Custom"}
            </button>
          ))}
        </div>
        {basis === "custom" && custom ? (
          <div className="mt-3 space-y-2">
            <SpanInputs title="Period A" span={custom.a} onChange={(a) => setCustom({ ...custom, a })} />
            <SpanInputs title="Period B" span={custom.b} onChange={(b) => setCustom({ ...custom, b })} />
            {!valid && <p className="text-[12px] text-negative">Each period must be 1 to 36 whole months, with the start before the end.</p>}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-ink-soft"><strong className="text-ink">{aLabel}</strong> against <strong className="text-ink">{bLabel}</strong></p>
        )}
      </Card>

      {!valid ? null : q.isLoading ? <Skeleton className="h-96 w-full" /> : !r ? (
        <EmptyState icon={BarChart3} title="Couldn't compare these periods" description="Try again in a moment." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {([["Spent", r.a.expense, r.b.expense, false], ["Income", r.a.income, r.b.income, true], ["Kept", r.a.kept, r.b.kept, true]] as const).map(([label, a, b, goodUp]) => {
              const d = a - b;
              return (
                <div key={label} className="min-w-0 rounded-[12px] border border-line bg-paper-raised p-3 sm:p-3.5">
                  <div className="text-[12px] text-ink-faint">{label}</div>
                  <div className="mt-1 text-[14.5px] font-semibold tabular-nums sm:text-[17px]">{formatCurrency(a)}</div>
                  <div className={cn("text-[12px] font-medium", Math.abs(d) < 0.5 ? "text-ink-faint" : (d > 0) === goodUp ? "text-accent" : "text-negative")}>{signedMoney(d)}</div>
                  <div className="text-[11.5px] text-ink-faint">was {formatCurrency(b)}</div>
                </div>
              );
            })}
          </div>
          <Card>
            <div className="text-[14.5px] font-semibold">What changed in spending</div>
            <div className="mb-3 text-[12.5px] text-ink-faint">{bLabel} to {aLabel}, by category.</div>
            {steps.length === 0 ? <p className="text-[13px] text-ink-faint">Spending was the same in both periods.</p> : <Waterfall from={r.b.expense} to={r.a.expense} steps={steps} fromLabel="Before" toLabel="Now" />}
          </Card>
          <Card>
            <div className="text-[14.5px] font-semibold">How often, or how much?</div>
            <div className="mb-3 text-[12.5px] text-ink-faint">Every change splits into buying more or less often, and paying more or less each time.</div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([["More or fewer purchases", r.volumeEffect, drivers("volumeEffect"), "volumeEffect"], ["Bigger or smaller purchases", r.ticketEffect, drivers("ticketEffect"), "ticketEffect"]] as const).map(([title, total, list, key]) => (
                <div key={title}>
                  <div className="text-[12.5px] text-ink-soft">{title}</div>
                  <div className={cn("text-[20px] font-semibold tabular-nums", total > 0 ? "text-negative" : total < 0 ? "text-accent" : "")}>{signedMoney(total)}</div>
                  <ul className="mt-1 text-[12.5px] text-ink-soft">{list.map((c) => <li key={c.categoryId} className="flex justify-between py-0.5"><span>{c.name}</span><span className="tabular-nums">{signedMoney(c[key])}</span></li>)}</ul>
                </div>
              ))}
            </div>
          </Card>
          <Card className="px-0 sm:px-5">
            <table className="w-full text-[13px]">
              <caption className="px-4 pb-2 text-left text-[14.5px] font-semibold sm:px-0">Every category</caption>
              <thead className="text-[11.5px] text-ink-faint">
                <tr>
                  <th scope="col" className="px-2 py-2 text-left font-semibold"><button type="button" onClick={() => setSort((s) => ({ key: "name", dir: s.key === "name" && s.dir === 1 ? -1 : 1 }))}>Category</button></th>
                  {head("b", "Before", "hidden sm:table-cell")}
                  {head("a", "Now", "hidden sm:table-cell")}
                  {head("change", "Change")}
                  {head("pct", "%")}
                  {head("share", "Share of change", "hidden md:table-cell")}
                  <th scope="col" className="hidden px-2 py-2 text-right font-semibold lg:table-cell">Purchases</th>
                  <th scope="col" className="hidden px-2 py-2 text-right font-semibold lg:table-cell">Avg purchase</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.categoryId} className="border-t border-line">
                    <td className="px-2 py-2">{c.name}</td>
                    <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{formatCurrency(c.b)}</td>
                    <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{formatCurrency(c.a)}</td>
                    <td className={cn("px-2 py-2 text-right font-medium tabular-nums", c.change > 0 ? "text-negative" : c.change < 0 ? "text-accent" : "")}>{signedMoney(c.change)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{signedPct(c.changePct)}</td>
                    <td className="hidden px-2 py-2 text-right tabular-nums md:table-cell">{Math.round(c.shareOfChangePct)}%</td>
                    <td className="hidden px-2 py-2 text-right tabular-nums lg:table-cell">{c.purchasesB} → {c.purchasesA}</td>
                    <td className="hidden px-2 py-2 text-right tabular-nums lg:table-cell">{formatCurrency(c.averagePurchaseB)} → {formatCurrency(c.averagePurchaseA)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
