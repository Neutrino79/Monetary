export interface Point {
  x: number;
  y: number;
  label?: string;
}
export interface Series {
  label: string;
  color: string;
  points: Point[];
}
export interface BarSeries {
  label: string;
  color: string;
  values: number[];
}
export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

const PADDING = { t: 16, r: 16, b: 28, l: 44 };

export function LineChart({
  series,
  width = 640,
  height = 220,
  yFormat,
}: {
  series: Series[];
  width?: number;
  height?: number;
  yFormat?: (v: number) => string;
}) {
  const allPoints = series.flatMap((s) => s.points);
  const maxY = Math.max(1, ...allPoints.map((p) => p.y)) * 1.15;
  const minY = Math.min(0, ...allPoints.map((p) => p.y));
  const n = series[0]?.points.length ?? 0;
  const innerW = width - PADDING.l - PADDING.r;
  const innerH = height - PADDING.t - PADDING.b;
  const xAt = (i: number) => PADDING.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => PADDING.t + innerH - ((v - minY) / (maxY - minY || 1)) * innerH;

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Line chart" preserveAspectRatio="xMidYMid meet">
      {gridFractions.map((f) => {
        const y = PADDING.t + innerH * (1 - f);
        const val = minY + (maxY - minY) * f;
        return (
          <g key={f}>
            <line x1={PADDING.l} y1={y} x2={width - PADDING.r} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text x={PADDING.l - 8} y={y + 4} className="fill-ink-faint text-[10px]" textAnchor="end">
              {yFormat ? yFormat(val) : Math.round(val)}
            </text>
          </g>
        );
      })}
      {series[0]?.points.map((p, i) => (
        <text key={i} x={xAt(i)} y={height - 6} className="fill-ink-faint text-[10px]" textAnchor="middle">
          {p.label ?? ""}
        </text>
      ))}
      {series.map((s) => {
        const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join(" ");
        const area =
          `M ${xAt(0).toFixed(1)} ${yAt(minY).toFixed(1)} ` +
          s.points.map((p, i) => `L ${xAt(i).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join(" ") +
          ` L ${xAt(s.points.length - 1).toFixed(1)} ${yAt(minY).toFixed(1)} Z`;
        return (
          <g key={s.label}>
            <path d={area} fill={s.color} opacity={0.08} />
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p, i) => (
              <circle key={i} cx={xAt(i)} cy={yAt(p.y)} r={3.5} fill={s.color}>
                <title>
                  {p.label}: {yFormat ? yFormat(p.y) : p.y}
                </title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({
  categories,
  series,
  width = 640,
  height = 220,
  yFormat,
  stacked = false,
}: {
  categories: string[];
  series: BarSeries[];
  width?: number;
  height?: number;
  yFormat?: (v: number) => string;
  stacked?: boolean;
}) {
  const n = categories.length || 1;
  const innerW = width - PADDING.l - PADDING.r;
  const innerH = height - PADDING.t - PADDING.b;
  const groupW = innerW / n;
  const maxStack = stacked
    ? Math.max(1, ...categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0)))
    : Math.max(1, ...series.flatMap((s) => s.values));
  const maxY = maxStack * 1.15;
  const yAt = (v: number) => PADDING.t + innerH - (v / maxY) * innerH;

  const bars: React.ReactNode[] = [];
  categories.forEach((cat, i) => {
    const groupX = PADDING.l + i * groupW;
    if (stacked) {
      let cursor = 0;
      series.forEach((s) => {
        const v = s.values[i] || 0;
        const barW = groupW * 0.5;
        const x = groupX + (groupW - barW) / 2;
        const yTop = yAt(cursor + v);
        const yBottom = yAt(cursor);
        bars.push(
          <rect key={`${cat}-${s.label}`} x={x} y={yTop} width={barW} height={Math.max(0, yBottom - yTop)} fill={s.color} rx={3}>
            <title>
              {s.label} — {cat}: {yFormat ? yFormat(v) : v}
            </title>
          </rect>,
        );
        cursor += v;
      });
    } else {
      const barW = (groupW * 0.62) / series.length;
      series.forEach((s, si) => {
        const v = s.values[i] || 0;
        const x = groupX + (groupW - barW * series.length) / 2 + si * barW;
        const yTop = yAt(v);
        const yBottom = yAt(0);
        bars.push(
          <rect key={`${cat}-${s.label}`} x={x} y={yTop} width={Math.max(0, barW - 3)} height={Math.max(1, yBottom - yTop)} fill={s.color} rx={3}>
            <title>
              {s.label} — {cat}: {yFormat ? yFormat(v) : v}
            </title>
          </rect>,
        );
      });
    }
    bars.push(
      <text key={`${cat}-label`} x={groupX + groupW / 2} y={height - 6} className="fill-ink-faint text-[10px]" textAnchor="middle">
        {cat}
      </text>,
    );
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Bar chart" preserveAspectRatio="xMidYMid meet">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PADDING.t + innerH * (1 - f);
        return (
          <g key={f}>
            <line x1={PADDING.l} y1={y} x2={width - PADDING.r} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text x={PADDING.l - 8} y={y + 4} className="fill-ink-faint text-[10px]" textAnchor="end">
              {yFormat ? yFormat(maxY * f) : Math.round(maxY * f)}
            </text>
          </g>
        );
      })}
      {bars}
    </svg>
  );
}

export function DonutChart({
  segments,
  size = 200,
  thickness = 26,
  centerLabel,
  centerSub,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - thickness / 2;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -90;

  const arcs = segments.map((seg) => {
    const frac = seg.value / total;
    const start = angle;
    const end = angle + frac * 360;
    angle = end;
    const large = end - start > 180 ? 1 : 0;
    const toXY = (deg: number): [number, number] => {
      const rad = (deg * Math.PI) / 180;
      return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    };
    const [x1, y1] = toXY(start);
    const [x2, y2] = toXY(end);
    return (
      <path
        key={seg.label}
        d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
        fill="none"
        stroke={seg.color}
        strokeWidth={thickness}
      >
        <title>
          {seg.label}: {Math.round(frac * 100)}%
        </title>
      </path>
    );
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto" role="img" aria-label="Breakdown chart" width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} opacity={0.35} />
      {arcs}
      {centerLabel && (
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-ink font-semibold" style={{ fontFamily: "var(--font-ledger)", fontSize: 20 }}>
          {centerLabel}
        </text>
      )}
      {centerSub && (
        <text x={cx} y={cy + 18} textAnchor="middle" className="fill-ink-faint" style={{ fontSize: 10.5 }}>
          {centerSub}
        </text>
      )}
    </svg>
  );
}

export function ProgressRing({ pct, size = 56, thickness = 6, color = "var(--accent)" }: { pct: number; size?: number; thickness?: number; color?: string }) {
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c * (1 - clamped / 100);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={c.toFixed(2)}
        strokeDashoffset={offset.toFixed(2)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
