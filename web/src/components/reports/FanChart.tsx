import type { Outlook } from "@/types";
import { useInspect } from "@/hooks/useInspect";
import { ChartTip } from "./ChartTip";
import { useElementWidth } from "@/hooks/useElementWidth";
import { bandPath, linePath, linear } from "@/lib/utils/chartMath";
import { formatCompact, formatCurrency } from "@/lib/utils/format";
import { monthLong, monthShort } from "@/lib/utils/reportText";

/** Net worth so far (solid), the expected path (dashed) with the likely range around it, and the
 *  same path if the chosen what-ifs happen (accent line). */
export function FanChart({ o, scenario }: { o: Outlook; scenario: number[] | null }) {
  const [ref, width, root] = useElementWidth<HTMLDivElement>(640);
  const inspect = useInspect<number>(undefined, root);
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
  const at = inspect.active;
  const hp = at !== null && at < hist.length ? hist[at] : undefined;
  const fi = at !== null && at >= hist.length ? at - hist.length : -1;
  const fp = fi >= 0 ? o.forecast[fi] : undefined;
  return (
    <div ref={ref} className="relative w-full">
      {at !== null && (hp || fp) && (
        <ChartTip
          x={x(at)}
          width={width}
          anchorY={y(hp ? hp.netWorth : fp!.high)}
          touch={inspect.touch}
          title={`${monthLong((hp ?? fp)!)} ${(hp ?? fp)!.year}${fp ? " \u00b7 forecast" : ""}`}
          rows={
            hp
              ? [{ label: "Net worth", value: formatCurrency(hp.netWorth) }]
              : [
                  { label: "Expected", value: formatCurrency(fp!.expected), color: "var(--accent)" },
                  { label: "Likely", value: `${formatCompact(fp!.low)} \u2013 ${formatCompact(fp!.high)}` },
                  ...(scenario && scenario[fi] !== undefined ? [{ label: "With what-ifs", value: formatCurrency(scenario[fi]!), color: "var(--info)" }] : []),
                ]
          }
        />
      )}
      <svg width={width} height={h} role="group" aria-label="Net worth so far and its expected path over the next 12 months">
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
        {at !== null && (hp || fp) && (
          <g pointerEvents="none">
            <line x1={x(at)} x2={x(at)} y1={m.t} y2={h - m.b} stroke="var(--ink)" strokeOpacity={0.35} />
            <circle cx={x(at)} cy={y(hp ? hp.netWorth : fp!.expected)} r={5.5} fill={hp ? "var(--ink)" : "var(--paper-raised)"} stroke={hp ? "var(--paper-raised)" : "var(--accent)"} strokeWidth={2.4} />
          </g>
        )}
        {Array.from({ length: n }, (_, i) => {
          const p = i < hist.length ? hist[i]! : o.forecast[i - hist.length]!;
          return (
            <rect
              key={i}
              x={x(i) - (width - m.l - m.r) / Math.max(1, n - 1) / 2}
              width={(width - m.l - m.r) / Math.max(1, n - 1)}
              y={0}
              height={h}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={`${monthLong(p)} ${p.year}: ${i < hist.length ? `net worth ${formatCurrency(hist[i]!.netWorth)}` : `expected ${formatCurrency(o.forecast[i - hist.length]!.expected)}`}`}
              className="outline-none"
              {...inspect.itemProps(i)}
            />
          );
        })}
        {yearEndIdx >= 0 && (
          <g>
            <line x1={fx(yearEndIdx)} x2={fx(yearEndIdx)} y1={m.t} y2={h - m.b} stroke="var(--warn)" strokeDasharray="2 3" />
            <circle cx={fx(yearEndIdx)} cy={y(o.forecast[yearEndIdx]!.expected)} r={4.5} fill="var(--warn)" />
            <text x={fx(yearEndIdx) - 6} y={m.t + 10} textAnchor="end" fontSize={10.5} fontWeight={700} fill="var(--warn)">Year end</text>
          </g>
        )}
        {ticks.map(({ i, p }) => <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize={10.5} fill="var(--ink-soft)">{monthShort(p)}</text>)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 bg-ink" />Net worth so far</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 border-t-2 border-dashed border-accent" />Expected</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-[3px] bg-accent/20" />Likely range</span>
        {scenario && <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 bg-info" />With your what-ifs</span>}
      </div>
    </div>
  );
}
