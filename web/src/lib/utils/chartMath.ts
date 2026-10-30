/** Small helpers for the hand-drawn SVG charts on the Reports page. */

export type Scale = (v: number) => number;

export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** A "nice" ceiling for an axis: 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}

export function linePath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/** A closed band between an upper and a lower edge, left to right. */
export function bandPath(upper: { x: number; y: number }[], lower: { x: number; y: number }[]): string {
  if (upper.length === 0) return "";
  const back = [...lower].reverse();
  return `${linePath(upper)} ${back.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} Z`;
}
