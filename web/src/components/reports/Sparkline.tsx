import { linear, linePath } from "@/lib/utils/chartMath";

/** A tiny trend line. `previous` draws the same length of the earlier window as a dotted line behind it. */
export function Sparkline({
  values,
  previous,
  color = "var(--accent)",
  height = 28,
  width = 96,
  band,
  dot = true,
}: {
  values: number[];
  previous?: number[];
  color?: string;
  height?: number;
  width?: number;
  /** A usual range drawn as a pale band behind the line. */
  band?: { low: number; high: number } | null;
  dot?: boolean;
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const all = [...values, ...(previous ?? []), ...(band ? [band.low, band.high] : [])];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const x = linear(0, values.length - 1, 2, width - 2);
  const y = linear(lo, hi === lo ? lo + 1 : hi, height - 3, 3);
  const pts = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const last = pts[pts.length - 1]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0 overflow-visible">
      {band && <rect x={0} width={width} y={y(band.high)} height={Math.max(1, y(band.low) - y(band.high))} fill="var(--line)" opacity={0.6} rx={2} />}
      {previous && previous.length > 1 && (
        <path d={linePath(previous.map((v, i) => ({ x: linear(0, previous.length - 1, 2, width - 2)(i), y: y(v) })))} fill="none" stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
      )}
      <path d={linePath(pts)} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      {dot && <circle cx={last.x} cy={last.y} r={2.6} fill={color} />}
    </svg>
  );
}
