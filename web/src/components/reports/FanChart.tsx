import type { Outlook } from "@/types";
import { useElementWidth } from "@/hooks/useElementWidth";
import { bandPath, linePath, linear } from "@/lib/utils/chartMath";
import { formatCompact, formatCurrency } from "@/lib/utils/format";
import { monthShort } from "@/lib/utils/reportText";

/** Net worth so far (solid), the expected path (dashed) with the likely range around it, and the
 *  same path if the chosen what-ifs happen (accent line). */
export function FanChart({ o, scenario }: { o: Outlook; scenario: number[] | null }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const h = 260;
  const m = { l: 48, r: 10, t: 12, b: 26 };
  const hist = o.history;
  const n = hist.length + o.forecast.length;
  const vals = [...hist.map((p) => p.netWorth), ...o.forecast.flatMap((f) => [f.low, f.high]), ...(scenario ?? [])];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.1 || 1;
  const x = linear(0, Math.max(1, n - 1), m.l, width - m.r);
  const y = linear(lo - pad, hi + pad, h - m.b, m.t);
  const hx = (i: number) => x(i);
  const fx = (i: number) => x(hist.length + i);
  const join = hist.length ? [{ x: hx(hist.length - 1), y: y(hist[hist.length - 1]!.netWorth) }] : [];
  const upper = [...join, ...o.forecast.map((f, i) => ({ x: fx(i), y: y(f.high) }))];
  const lower = [...join, ...o.forecast.map((f, i) => ({ x: fx(i), y: y(f.low) }))];
  const yearEndIdx = o.yearEnd ? o.forecast.findIndex((f) => f.year === o.yearEnd!.netWorth.year && f.month === o.yearEnd!.netWorth.month) : -1;
  const ticks = [...hist.map((p, i) => ({ i, p })), ...o.forecast.map((p, i) => ({ i: hist.length + i, p }))].filter((_, k) => k % Math.max(1, Math.ceil(n / (width < 480 ? 6 : 12))) === 0);
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={h} role="img" aria-label="Net worth so far and its expected path over the next 12 months">
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">{formatCompact(v)}</text>
          </g>
        ))}
        <path d={bandPath(upper, lower)} fill="var(--accent)" opacity={0.12} />
        <path d={linePath(hist.map((p, i) => ({ x: hx(i), y: y(p.netWorth) })))} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
        <path d={linePath([...join, ...o.forecast.map((f, i) => ({ x: fx(i), y: y(f.expected) }))])} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" />
        {scenario && <path d={linePath([...join, ...scenario.map((v, i) => ({ x: fx(i), y: y(v) }))])} fill="none" stroke="var(--info)" strokeWidth={2.2} />}
        {o.forecast.map((f, i) => <circle key={i} cx={fx(i)} cy={y(f.expected)} r={8} fill="transparent"><title>{`${monthShort(f)} ${f.year}: about ${formatCurrency(f.expected)}, likely ${formatCurrency(f.low)} to ${formatCurrency(f.high)}`}</title></circle>)}
        {yearEndIdx >= 0 && (
          <g>
            <line x1={fx(yearEndIdx)} x2={fx(yearEndIdx)} y1={m.t} y2={h - m.b} stroke="var(--warn)" strokeDasharray="2 3" />
            <circle cx={fx(yearEndIdx)} cy={y(o.forecast[yearEndIdx]!.expected)} r={4.5} fill="var(--warn)" />
            <text x={fx(yearEndIdx) - 6} y={m.t + 10} textAnchor="end" fontSize={10.5} fontWeight={700} fill="var(--warn)">Year end</text>
          </g>
        )}
        {ticks.map(({ i, p }) => <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize={10.5} fill="var(--ink-soft)">{monthShort(p)}</text>)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 bg-ink" />Net worth so far</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 border-t-2 border-dashed border-accent" />Expected</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-[3px] bg-accent/20" />Likely range</span>
        {scenario && <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 bg-info" />With your what-ifs</span>}
      </div>
    </div>
  );
}
