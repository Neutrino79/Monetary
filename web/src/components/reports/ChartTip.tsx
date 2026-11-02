import { tipHeight } from "@/lib/utils/chartMath";

export interface TipRow {
  label: string;
  value: string;
  /** A swatch before the label. */
  color?: string;
}

const TIP_WIDTH = 196;

/** The readout for the month (or category) under the pointer or finger. It is dark like the dashboard's,
 *  sits just above `anchorY` (the top of the bar or the point) so it never covers what you are reading, and
 *  drops below the point only when there is no room above. */
export function ChartTip({ x, width, anchorY, title, rows, touch = false }: { x: number; width: number; anchorY: number; title: string; rows: TipRow[]; touch?: boolean }) {
  const h = tipHeight(rows.length, touch);
  const left = Math.max(4, Math.min(width - TIP_WIDTH - 4, x - TIP_WIDTH / 2));
  const above = anchorY - h - 10;
  const top = above >= 2 ? above : anchorY + 14;
  return (
    <div
      role="status"
      data-testid="chart-tip"
      className="pointer-events-none absolute z-10 rounded-control bg-ink px-3 py-2 text-caption leading-[17px] text-paper"
      style={{ left, top, width: TIP_WIDTH }}
    >
      <div className="font-semibold">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-2 opacity-90">
          <span className="flex items-center gap-1.5">
            {r.color && <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tabular-nums">{r.value}</span>
        </div>
      ))}
      {touch && <div className="opacity-75">Tap again to open</div>}
    </div>
  );
}
