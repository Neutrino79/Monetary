/** A small trend line through a series of values, scaled to its own range. Colour comes from `currentColor`. */
export function Sparkline({ values, label, height = 40 }: { values: number[]; label: string; height?: number }) {
  if (values.length < 2) return null;
  const W = 320;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(pad + (1 - (v - min) / span) * (height - pad * 2)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
