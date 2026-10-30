import { cn } from "@/lib/utils/cn";

export interface TipRow {
  label: string;
  value: string;
  /** A swatch before the label. */
  color?: string;
  tone?: "good" | "bad";
}

const TIP_WIDTH = 196;

/** The readout that appears over a chart for the month (or category) under the pointer or finger.
 *  `x` is where it points, in pixels from the chart's left edge; it never leaves the chart. */
export function ChartTip({ x, width, title, rows, note }: { x: number; width: number; title: string; rows: TipRow[]; note?: string }) {
  const left = Math.max(0, Math.min(width - TIP_WIDTH, x - TIP_WIDTH / 2));
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 rounded-[10px] border border-line bg-paper-raised px-3 py-2 text-[12px] shadow-md"
      style={{ left, width: TIP_WIDTH }}
    >
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-2 py-px">
          <span className="flex items-center gap-1.5 text-ink-soft">
            {r.color && <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className={cn("font-medium tabular-nums", r.tone === "good" && "text-accent", r.tone === "bad" && "text-negative")}>{r.value}</span>
        </div>
      ))}
      {note && <div className="mt-1 border-t border-line pt-1 text-ink-faint">{note}</div>}
    </div>
  );
}
