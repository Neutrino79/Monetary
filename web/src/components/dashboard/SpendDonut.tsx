import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInspect } from "@/hooks/useInspect";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export interface DonutRow {
  /** Category id, or null for the "Others" group. */
  id: number | null;
  name: string;
  value: number;
  color: string;
}

const SIZE = 172;
const THICK = 26;
const R = SIZE / 2 - THICK / 2;
const C = SIZE / 2;

const point = (deg: number): [number, number] => {
  const rad = (deg * Math.PI) / 180;
  return [C + R * Math.cos(rad), C + R * Math.sin(rad)];
};

/**
 * Where the month's spending went, one slice per category. Hover a slice (or its name) for the amount and share;
 * click it to see those transactions. On a phone the first tap shows the amount and the second opens the list.
 */
export function SpendDonut({ rows, total, month }: { rows: DonutRow[]; total: number; month: string }) {
  const navigate = useNavigate();
  const href = (r: DonutRow) => (r.id == null ? `/expenses?month=${month}` : `/expenses?category=${r.id}&month=${month}`);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const inspect = useInspect<string>((key) => {
    const r = rows.find((x) => x.name === key);
    if (r) navigate(href(r));
  }, root);
  const sum = rows.reduce((s, r) => s + r.value, 0) || 1;
  const hovered = rows.find((r) => r.name === inspect.active);

  const arcs = rows.map((r, i) => {
    const before = rows.slice(0, i).reduce((t, x) => t + x.value, 0);
    return { r, start: -90 + (before / sum) * 360, end: -90 + ((before + r.value) / sum) * 360 };
  });

  return (
    <div ref={setRoot}>
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Spending by category: ${rows.map((r) => `${r.name} ${formatCurrency(r.value)}`).join(", ")}`}>
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--paper-sunken)" strokeWidth={THICK} />
          {arcs.map(({ r, start, end }) => {
            const dim = hovered && hovered.name !== r.name;
            const common = {
              stroke: r.color, fill: "none", strokeWidth: hovered?.name === r.name ? THICK + 4 : THICK, opacity: dim ? 0.35 : 1,
              className: "cursor-pointer transition-[opacity,stroke-width]", "data-testid": `donut-slice-${r.name}`,
              ...inspect.itemProps(r.name),
            };
            if (end - start >= 359.9) return <circle key={r.name} cx={C} cy={C} r={R} {...common} />;
            const [x1, y1] = point(start);
            const [x2, y2] = point(end);
            return <path key={r.name} d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${end - start > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`} {...common} />;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center" data-testid="donut-centre">
          <span className="ledger-figure text-[20px]">{formatCurrency(hovered ? hovered.value : total)}</span>
          <span className="text-micro leading-tight text-ink-soft">
            {hovered ? `${hovered.name} · ${Math.round((hovered.value / sum) * 100)}%` : "total spent"}
          </span>
          {hovered && inspect.touch && <span className="mt-0.5 text-[10.5px] text-ink-faint">Tap again to open</span>}
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-3.5 gap-y-1.5 text-caption">
        {rows.map((r) => (
          <li key={r.name}>
            <Link to={href(r)} {...inspect.itemProps(r.name)} className={cn("flex items-center gap-1.5 rounded-[6px] text-ink-soft hover:text-ink", hovered && hovered.name !== r.name && "opacity-50")}>
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: r.color }} />
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
