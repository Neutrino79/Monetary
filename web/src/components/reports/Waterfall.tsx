import { useElementWidth } from "@/hooks/useElementWidth";
import { linear } from "@/lib/utils/chartMath";
import { formatCompact, formatCurrency } from "@/lib/utils/format";
import { signedMoney } from "@/lib/utils/reportText";

export interface Step {
  /** The category it stands for; absent for the combined "Other" step. */
  id?: number;
  name: string;
  change: number;
}

/** From what was spent in period B to what was spent in period A, one step per category.
 *  The axis does not start at zero, so the steps stay readable; the axis labels say so. */
export function Waterfall({ from, to, steps, fromLabel, toLabel, selected, onSelect }: { from: number; to: number; steps: Step[]; fromLabel: string; toLabel: string; selected?: number | null; onSelect?: (id: number | null) => void }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const h = 250;
  const m = { l: 46, r: 8, t: 12, b: 58 };
  const bars = steps.map((s, i) => {
    const start = from + steps.slice(0, i).reduce((a, x) => a + x.change, 0);
    return { ...s, start, end: start + s.change };
  });
  const levels = [from, to, ...bars.flatMap((b) => [b.start, b.end])];
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
  const y = linear(Math.max(0, lo - pad), hi + pad, h - m.b, m.t);
  const cols = bars.length + 2;
  const slot = (width - m.l - m.r) / cols;
  const bw = Math.max(10, Math.min(46, slot * 0.62));
  const cx = (i: number) => m.l + slot * (i + 0.5);
  const total = (i: number, label: string, v: number) => (
    <g key={label}>
      <title>{`${label}: ${formatCurrency(v)}`}</title>
      <rect x={cx(i) - bw / 2} width={bw} y={y(v)} height={Math.max(1, y(Math.max(0, lo - pad)) - y(v))} rx={2} fill="var(--ink-soft)" opacity={0.8} />
      <text x={cx(i)} y={y(v) - 5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--ink)">{formatCompact(v)}</text>
      <text x={cx(i)} y={h - m.b + 14} textAnchor="middle" fontSize={10.5} fill="var(--ink-soft)">{label}</text>
    </g>
  );
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={h} role="img" aria-label={`Spending from ${fromLabel} to ${toLabel}, by category`}>
        {[lo, hi].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">{formatCompact(v)}</text>
          </g>
        ))}
        {total(0, fromLabel, from)}
        {bars.map((b, i) => {
          const up = b.change > 0;
          const top = y(Math.max(b.start, b.end));
          return (
            <g
              key={b.name}
              opacity={selected == null || b.id === selected ? 1 : 0.4}
              role={b.id === undefined ? undefined : "button"}
              tabIndex={b.id === undefined ? undefined : 0}
              aria-pressed={b.id === undefined ? undefined : b.id === selected}
              aria-label={b.id === undefined ? undefined : `${b.name}: ${signedMoney(b.change)}. Show details.`}
              className={b.id === undefined ? undefined : "cursor-pointer outline-none"}
              onClick={() => b.id !== undefined && onSelect?.(b.id === selected ? null : b.id)}
              onKeyDown={(e) => { if (b.id !== undefined && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect?.(b.id === selected ? null : b.id); } }}
            >
              <title>{`${b.name}: ${signedMoney(b.change)}`}</title>
              <rect x={cx(i + 1) - slot / 2} width={slot} y={m.t} height={h - m.t - m.b + 40} fill="transparent" />
              <line x1={cx(i) - slot / 2 + bw / 2 + 2} x2={cx(i + 1) - bw / 2} y1={y(b.start)} y2={y(b.start)} stroke="var(--line-strong)" />
              <rect x={cx(i + 1) - bw / 2} width={bw} y={top} height={Math.max(2, Math.abs(y(b.start) - y(b.end)))} rx={2} fill={up ? "var(--negative)" : "var(--accent)"} stroke={b.id !== undefined && b.id === selected ? "var(--ink)" : "none"} strokeWidth={2} />
              <text x={cx(i + 1)} y={top - 5} textAnchor="middle" fontSize={10} fill={up ? "var(--negative)" : "var(--accent)"}>{`${up ? "+" : "\u2212"}${formatCompact(Math.abs(b.change))}`}</text>
              <text x={cx(i + 1)} y={h - m.b + 14} textAnchor="middle" fontSize={10.5} fill="var(--ink-soft)" transform={`rotate(28 ${cx(i + 1)} ${h - m.b + 14})`}>{b.name.length > 10 ? `${b.name.slice(0, 9)}…` : b.name}</text>
            </g>
          );
        })}
        {total(cols - 1, toLabel, to)}
      </svg>
      <div className="text-micro text-ink-faint">The axis starts at {formatCompact(Math.max(0, lo - pad))}, not zero. Red steps are spending that rose; green steps fell.</div>
    </div>
  );
}
