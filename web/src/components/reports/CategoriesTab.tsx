import { useState } from "react";
import { BarChart3 } from "lucide-react";
import type { CategoryTrend, CategoriesReport } from "@/types";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useCategoriesReport } from "@/hooks/queries";
import { useElementWidth } from "@/hooks/useElementWidth";
import { linear } from "@/lib/utils/chartMath";
import { colorForId } from "@/lib/utils/entityVisuals";
import { formatCompact, formatCurrency } from "@/lib/utils/format";
import { signedMoney, signedPct } from "@/lib/utils/reportText";
import { Sparkline } from "./Sparkline";
import { cn } from "@/lib/utils/cn";

const colorOf = (c: CategoryTrend) => c.color ?? colorForId(c.categoryId);
const moved = (c: CategoryTrend) => c.average - c.previousAverage;

/** Size against growth: how much of the total a category is (across), how much it changed (up). */
function GrowthBubbles({ cats }: { cats: CategoryTrend[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const h = 260;
  const m = { l: 40, r: 14, t: 14, b: 30 };
  const rows = cats.filter((c) => c.changePct !== null).slice(0, 14);
  if (rows.length < 2) return null;
  const cap = (p: number) => Math.max(-100, Math.min(150, p));
  const maxShare = Math.max(20, ...rows.map((c) => c.sharePct)) * 1.1;
  const lo = Math.min(-20, ...rows.map((c) => cap(c.changePct!)));
  const hi = Math.max(20, ...rows.map((c) => cap(c.changePct!)));
  const x = linear(0, maxShare, m.l, width - m.r);
  const y = linear(lo, hi, h - m.b, m.t);
  const maxAvg = Math.max(1, ...rows.map((c) => c.average));
  const splitX = Math.min(15, maxShare / 2);
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={h} role="img" aria-label="Categories by share of spending and change against the earlier window">
        <rect x={x(splitX)} y={m.t} width={width - m.r - x(splitX)} height={y(0) - m.t} fill="var(--warn)" opacity={0.08} />
        <text x={width - m.r - 4} y={m.t + 12} textAnchor="end" fontSize={10.5} fontWeight={700} fill="var(--warn)">LOOK HERE FIRST</text>
        <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
        <line x1={x(splitX)} x2={x(splitX)} y1={m.t} y2={h - m.b} stroke="var(--line)" strokeDasharray="3 4" />
        <text x={m.l - 6} y={y(0) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">0%</text>
        <text x={m.l - 6} y={m.t + 10} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">{`+${Math.round(hi)}%`}</text>
        <text x={m.l - 6} y={h - m.b} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">{`${Math.round(lo)}%`}</text>
        <text x={(m.l + width - m.r) / 2} y={h - 6} textAnchor="middle" fontSize={11} fill="var(--ink-faint)">Share of the total →</text>
        {rows.map((c) => {
          const r = 5 + 14 * Math.sqrt(c.average / maxAvg);
          const cx = x(c.sharePct);
          const cy = y(cap(c.changePct!));
          return (
            <g key={c.categoryId}>
              <title>{`${c.name}: ${c.sharePct.toFixed(0)}% of the total, ${signedPct(c.changePct)} vs the window before`}</title>
              <circle cx={cx} cy={cy} r={r} fill={colorOf(c)} opacity={0.75} />
              {r > 11 && <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff">{c.name.slice(0, 5)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Each category's change in average a month, biggest movers first, as a diverging list. */
function Movers({ cats, kind }: { cats: CategoryTrend[]; kind: CategoriesReport["kind"] }) {
  const rows = [...cats].filter((c) => Math.abs(moved(c)) >= 1).sort((a, b) => Math.abs(moved(b)) - Math.abs(moved(a))).slice(0, 8);
  if (rows.length === 0) return null;
  const peak = Math.max(...rows.map((c) => Math.abs(moved(c))));
  const goodWhenUp = kind === "income";
  return (
    <ul className="space-y-2" aria-label="Change in monthly average by category">
      {rows.map((c) => {
        const d = moved(c);
        const good = (d > 0) === goodWhenUp;
        const w = `${Math.max(3, (Math.abs(d) / peak) * 50)}%`;
        return (
          <li key={c.categoryId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-3 text-[13px]">
            <span className="truncate">{c.name}</span>
            <span className="relative h-3.5 rounded-[3px] bg-paper-sunken">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
              <span className={cn("absolute inset-y-0 rounded-[3px]", good ? "bg-accent" : "bg-negative")} style={d >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }} />
            </span>
            <span className={cn("w-20 text-right font-medium tabular-nums", good ? "text-accent" : "text-negative")}>{signedMoney(d)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function headline(r: CategoriesReport): string {
  const noun = r.kind === "spending" ? "Spending" : "Income";
  const t = r.total;
  const base = `${noun} averages ${formatCurrency(t.average)} a month`;
  if (t.changePct === null) return `${base}.`;
  const dir = Math.abs(t.changePct) < 1 ? "level with" : `${signedPct(t.changePct)} against`;
  const top = [...r.categories].sort((a, b) => Math.abs(moved(b)) - Math.abs(moved(a)))[0];
  const tail = top && Math.abs(moved(top)) >= 1 ? `, mostly ${top.name} (${signedMoney(moved(top))} a month)` : "";
  return `${base}, ${dir} the window before${tail}.`;
}

const STATE_LABEL = { above: "Above usual", below: "Below usual", normal: "Normal" } as const;

function CategoryCard({ c, kind }: { c: CategoryTrend; kind: CategoriesReport["kind"] }) {
  const bad = kind === "spending" ? c.state === "above" : c.state === "below";
  const good = kind === "spending" ? c.state === "below" : c.state === "above";
  const growing = c.slope > 0;
  return (
    <li className="rounded-[12px] border border-line bg-paper-raised p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(c) }} />
          <span className="truncate text-[13.5px] font-semibold">{c.name}</span>
        </div>
        {c.state && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", bad ? "bg-negative/10 text-negative" : good ? "bg-accent/10 text-accent" : "bg-paper-sunken text-ink-soft")}>{STATE_LABEL[c.state]}</span>}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-[18px] font-semibold tabular-nums">{formatCurrency(c.current)}</div>
          <div className="text-[11.5px] text-ink-faint">this month{c.usual ? ` · usual ${formatCompact(c.usual.low)}–${formatCompact(c.usual.high)}` : ""}</div>
        </div>
        <Sparkline values={c.points} band={c.usual ? { low: c.usual.low, high: c.usual.high } : null} color={colorOf(c)} width={104} height={40} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px] text-ink-soft">
        <span>{Math.abs(c.slope) < 1 ? "Trend flat" : `Trend ${growing ? "▲" : "▼"} ${signedMoney(c.slope)} a month`}</span>
        <span>{c.sharePct.toFixed(0)}% of total</span>
      </div>
    </li>
  );
}

type Filter = "all" | "above" | "below" | "growing";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "above", label: "Above usual" },
  { value: "below", label: "Below usual" },
  { value: "growing", label: "Growing" },
];

export function CategoriesTab({ months }: { months: number }) {
  const [kind, setKind] = useState<"spending" | "income">("spending");
  const [filter, setFilter] = useState<Filter>("all");
  const q = useCategoriesReport(months, kind);
  const r = q.data;
  const cats = (r?.categories ?? []).filter((c) => (filter === "all" ? true : filter === "growing" ? c.slope > 0 && c.changePct !== null && c.changePct > 0 : c.state === filter));
  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Spending or income" className="inline-flex rounded-[10px] border border-line bg-paper-raised p-0.5">
        {(["spending", "income"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("rounded-[8px] px-3.5 py-1.5 text-[12.8px] font-semibold", kind === k ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}>
            {k === "spending" ? "Spending" : "Income"}
          </button>
        ))}
      </div>
      {q.isLoading ? <Skeleton className="h-96 w-full" /> : !r || r.categories.length === 0 ? (
        <EmptyState icon={BarChart3} title={`No ${kind} in this range`} description="Pick a longer range, or add some transactions." />
      ) : (
        <>
          <p className="text-[15px] font-medium leading-snug">{headline(r)}</p>
          <div className="grid gap-5 lg:grid-cols-2">
            {r.categories.filter((c) => c.changePct !== null).length >= 2 && (
              <Card>
                <div className="text-[14.5px] font-semibold">Size against growth</div>
                <div className="mb-3 text-[12.5px] text-ink-faint">Big and rising categories sit top right.</div>
                <GrowthBubbles cats={r.categories} />
              </Card>
            )}
            <Card>
              <div className="text-[14.5px] font-semibold">Who moved the total</div>
              <div className="mb-3 text-[12.5px] text-ink-faint">Change in monthly average against the window before.</div>
              <Movers cats={r.categories} kind={r.kind} />
            </Card>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter categories">
            {FILTERS.map((f) => <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-medium", filter === f.value ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised text-ink-soft hover:text-ink")}>{f.label}</button>)}
          </div>
          {cats.length === 0 ? <p className="text-[13px] text-ink-faint">No categories match this filter.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cats.map((c) => <CategoryCard key={c.categoryId} c={c} kind={r.kind} />)}</ul>
          )}
        </>
      )}
    </div>
  );
}
