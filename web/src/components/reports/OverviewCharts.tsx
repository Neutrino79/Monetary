import { useNavigate } from "react-router-dom";
import type { NetWorthMonth, OverviewMonth, IncomeMixSource } from "@/types";
import { useInspect } from "@/hooks/useInspect";
import { useElementWidth } from "@/hooks/useElementWidth";
import { linear, linePath, niceCeil, tipHeight } from "@/lib/utils/chartMath";
import { formatCompact, formatCurrency } from "@/lib/utils/format";
import { monthKey, monthLong, monthShort, signedMoney } from "@/lib/utils/reportText";
import { monthLink } from "@/lib/utils/reportLinks";
import { ChartTip } from "./ChartTip";
import { colorForId } from "@/lib/utils/entityVisuals";


/** A transparent column over one month: hover or focus shows its readout, a click (or Enter) opens it. */
function MonthHit({ x, w, h, label, inspect, i, open }: { x: number; w: number; h: number; label: string; inspect: ReturnType<typeof useInspect<number>>; i: number; open: () => void }) {
  return (
    <rect
      x={x}
      width={w}
      y={0}
      height={h}
      fill="transparent"
      role="link"
      tabIndex={0}
      aria-label={label}
      className="cursor-pointer outline-none"
      {...inspect.itemProps(i)}
      onKeyDown={(e) => { if (e.key === "Enter") open(); }}
    />
  );
}

const PAD = { l: 44, r: 8, t: 10, b: 38 };
/** Room above the tallest bar for the readout, as the dashboard's bar chart leaves. */
const HEAD = tipHeight(3, true) + 12;
const H = HEAD + 188;

/** Income and spending side by side per month, a 3-month rolling spend line, unusual months circled,
 *  and the savings rate under each month. */
export function CashflowChart({ points }: { points: OverviewMonth[] }) {
  const [ref, width, root] = useElementWidth<HTMLDivElement>(640);
  const navigate = useNavigate();
  const openMonth = (i: number) => navigate(monthLink(monthKey(points[i]!)));
  const inspect = useInspect<number>(openMonth, root);
  const on = inspect.active !== null ? points[inspect.active] : undefined;
  const peak = niceCeil(Math.max(1, ...points.flatMap((p) => [p.income, p.expense, p.rollingExpense])));
  const x0 = PAD.l;
  const x1 = width - PAD.r;
  const y = linear(0, peak, H - PAD.b, HEAD);
  const slot = (x1 - x0) / Math.max(1, points.length);
  const bar = Math.max(3, Math.min(18, slot * 0.32));
  const cx = (i: number) => x0 + slot * (i + 0.5);
  const showEvery = slot < 34 ? 2 : 1;
  return (
    <div ref={ref} className="relative w-full">
      {on && inspect.active !== null && (
        <ChartTip
          x={cx(inspect.active)}
          width={width}
          anchorY={y(Math.max(on.income, on.expense)) - (on.unusual ? 16 : 0)}
          touch={inspect.touch}
          title={`${monthLong(on)} ${on.year}${on.isPartial ? " (so far)" : ""}${on.unusual ? " \u00b7 unusual" : ""}`}
          rows={[
            { label: "In", value: formatCurrency(on.income), color: "var(--accent)" },
            { label: "Out", value: formatCurrency(on.expense), color: "var(--line-strong)" },
            { label: on.net >= 0 ? "Kept" : "Overspent", value: `${formatCurrency(Math.abs(on.net))}${on.savingsRate === null ? "" : ` \u00b7 ${Math.round(on.savingsRate)}%`}` },
          ]}
        />
      )}
      <svg width={width} height={H} role="group" aria-label="Income, spending and the rolling spending average by month">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={x0} x2={x1} y1={y(peak * f)} y2={y(peak * f)} stroke="var(--line)" strokeDasharray={f === 0 ? undefined : "3 4"} />
            <text x={x0 - 6} y={y(peak * f) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">{formatCompact(peak * f)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={`${p.year}-${p.month}`} opacity={inspect.active !== null && inspect.active !== i ? 0.45 : p.isPartial ? 0.55 : 1}>
            <title>{`${monthLong(p)} ${p.year}: in ${formatCurrency(p.income)}, out ${formatCurrency(p.expense)}${p.savingsRate === null ? "" : `, kept ${Math.round(p.savingsRate)}%`}${p.isPartial ? " (month in progress)" : ""}`}</title>
            <rect x={cx(i) - bar - 1} width={bar} y={y(p.income)} height={Math.max(0, y(0) - y(p.income))} rx={2} fill="var(--accent)" />
            <rect x={cx(i) + 1} width={bar} y={y(p.expense)} height={Math.max(0, y(0) - y(p.expense))} rx={2} fill="var(--line-strong)" />
            {i % showEvery === 0 && (
              <>
                <text x={cx(i)} y={H - 20} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">{monthShort(p)}</text>
                <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={p.savingsRate !== null && p.savingsRate < 0 ? "var(--negative)" : "var(--ink-faint)"}>
                  {p.savingsRate === null ? "" : `${Math.round(p.savingsRate)}%`}
                </text>
              </>
            )}
            {p.unusual && <circle cx={cx(i)} cy={y(Math.max(p.income, p.expense)) - 8} r={6} fill="none" stroke="var(--warn)" strokeWidth={1.6} />}
          </g>
        ))}
        <path d={linePath(points.map((p, i) => ({ x: cx(i), y: y(p.rollingExpense) })))} fill="none" stroke="var(--negative)" strokeWidth={1.8} strokeLinejoin="round" />
        {points.map((p, i) => (
          <MonthHit key={`hit-${p.year}-${p.month}`} x={x0 + slot * i} w={slot} h={H} i={i} inspect={inspect} open={() => openMonth(i)} label={`${monthLong(p)} ${p.year}: income ${formatCurrency(p.income)}, spending ${formatCurrency(p.expense)}. Open transactions.`} />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
        <Key color="var(--accent)" label="Income" />
        <Key color="var(--line-strong)" label="Spending" />
        <Key color="var(--negative)" label="3-month average spend" line />
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-warn" />Unusual month</span>
        <span className="text-ink-faint">Percent under a month = share of income kept</span>
      </div>
    </div>
  );
}

function Key({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={line ? "inline-block h-0.5 w-3.5" : "inline-block h-2.5 w-2.5 rounded-[3px]"} style={{ background: color }} />
      {label}
    </span>
  );
}

/** Net worth as a line, with what is owed as small bars underneath. */
export function NetWorthChart({ points }: { points: NetWorthMonth[] }) {
  const [ref, width, root] = useElementWidth<HTMLDivElement>(640);
  const navigate = useNavigate();
  const inspect = useInspect<number>(() => navigate("/accounts"), root);
  const on = inspect.active !== null ? points[inspect.active] : undefined;
  const before = inspect.active !== null && inspect.active > 0 ? points[inspect.active - 1] : undefined;
  const h = 190;
  const owedH = 34;
  const lo = Math.min(...points.map((p) => p.netWorth));
  const hi = Math.max(...points.map((p) => p.netWorth));
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  const x0 = PAD.l;
  const x1 = width - PAD.r;
  const y = linear(lo - pad, hi + pad, h - owedH - 22, 8);
  const x = linear(0, Math.max(1, points.length - 1), x0 + 6, x1 - 6);
  const maxOwed = Math.max(1, ...points.map((p) => p.liabilities));
  const oy = linear(0, maxOwed, h - 18, h - 18 - owedH + 6);
  const slot = (x1 - x0) / Math.max(1, points.length);
  const showEvery = slot < 34 ? 2 : 1;
  return (
    <div ref={ref} className="relative w-full">
      {on && inspect.active !== null && (
        <ChartTip
          x={x(inspect.active)}
          width={width}
          anchorY={y(on.netWorth)}
          touch={inspect.touch}
          title={`${monthLong(on)} ${on.year}`}
          rows={[
            { label: "Net worth", value: formatCurrency(on.netWorth), color: "var(--accent)" },
            { label: "Owe", value: formatCurrency(on.liabilities), color: "var(--negative)" },
            ...(before ? [{ label: "Since last month", value: signedMoney(on.netWorth - before.netWorth) }] : []),
          ]}
        />
      )}
      <svg width={width} height={h} role="group" aria-label="Net worth by month, with what you owe underneath">
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={x0 - 6} y={y(v) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">{formatCompact(v)}</text>
          </g>
        ))}
        <path d={linePath(points.map((p, i) => ({ x: x(i), y: y(p.netWorth) })))} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={`${p.year}-${p.month}`}>
            <title>{`${monthLong(p)} ${p.year}: net worth ${formatCurrency(p.netWorth)}, owed ${formatCurrency(p.liabilities)}`}</title>
            <circle cx={x(i)} cy={y(p.netWorth)} r={inspect.active === i ? 5 : i === points.length - 1 ? 3.6 : 2} fill="var(--accent)" stroke={inspect.active === i ? "var(--paper-raised)" : "none"} strokeWidth={2} />
            <rect x={x(i) - 5} width={10} y={oy(p.liabilities)} height={Math.max(0, h - 18 - oy(p.liabilities))} rx={2} fill="var(--negative)" opacity={inspect.active === null || inspect.active === i ? 0.5 : 0.2} />
            {i % showEvery === 0 && <text x={x(i)} y={h - 4} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">{monthShort(p)}</text>}
          </g>
        ))}
        {inspect.active !== null && <line x1={x(inspect.active)} x2={x(inspect.active)} y1={8} y2={h - 18} stroke="var(--ink-faint)" strokeDasharray="3 3" />}
        {points.map((p, i) => (
          <MonthHit key={`hit-${p.year}-${p.month}`} x={x(i) - (x1 - x0) / Math.max(1, points.length - 1) / 2} w={(x1 - x0) / Math.max(1, points.length - 1)} h={h} i={i} inspect={inspect} open={() => navigate("/accounts")} label={`${monthLong(p)} ${p.year}: net worth ${formatCurrency(p.netWorth)}. Open accounts.`} />
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-caption text-ink-soft">
        <Key color="var(--accent)" label="Net worth" line />
        <Key color="var(--negative)" label="Owed (cards and loans)" />
      </div>
    </div>
  );
}

/** Where income came from, stacked by source for each month. */
export function IncomeMixChart({ months, sources }: { months: OverviewMonth[]; sources: IncomeMixSource[] }) {
  const [ref, width, root] = useElementWidth<HTMLDivElement>(640);
  const navigate = useNavigate();
  const openMonth = (i: number) => navigate(monthLink(monthKey(months[i]!), "income"));
  const inspect = useInspect<number>(openMonth, root);
  const on = inspect.active !== null ? months[inspect.active] : undefined;
  const head = tipHeight(sources.length + 1, true) + 12;
  const h = head + 112;
  const totals = months.map((_, i) => sources.reduce((a, s) => a + (s.points[i] ?? 0), 0));
  const peak = niceCeil(Math.max(1, ...totals));
  const x0 = PAD.l;
  const x1 = width - PAD.r;
  const y = linear(0, peak, h - 22, head);
  const slot = (x1 - x0) / Math.max(1, months.length);
  const bar = Math.max(6, Math.min(34, slot * 0.6));
  const showEvery = slot < 34 ? 2 : 1;
  const colorOf = (s: IncomeMixSource, i: number) => s.color ?? colorForId(s.categoryId ?? i);
  return (
    <div ref={ref} className="relative w-full">
      {on && inspect.active !== null && (
        <ChartTip
          x={x0 + slot * (inspect.active + 0.5)}
          width={width}
          anchorY={y(totals[inspect.active] ?? 0)}
          touch={inspect.touch}
          title={`${monthLong(on)} ${on.year}`}
          rows={[
            ...sources.map((s, si) => ({ label: s.name, value: formatCurrency(s.points[inspect.active!] ?? 0), color: colorOf(s, si) })),
            { label: "Total", value: formatCurrency(totals[inspect.active] ?? 0) },
          ]}
        />
      )}
      <svg width={width} height={h} role="group" aria-label="Income by source and month">
        <line x1={x0} x2={x1} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        <text x={x0 - 6} y={y(peak) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">{formatCompact(peak)}</text>
        {months.map((m, i) => {
          let acc = 0;
          return (
            <g key={`${m.year}-${m.month}`} opacity={inspect.active !== null && inspect.active !== i ? 0.45 : m.isPartial ? 0.55 : 1}>
              {sources.map((s, si) => {
                const v = s.points[i] ?? 0;
                const top = y(acc + v);
                const rect = <rect key={si} x={x0 + slot * (i + 0.5) - bar / 2} width={bar} y={top} height={Math.max(0, y(acc) - top)} fill={colorOf(s, si)}><title>{`${monthLong(m)} ${m.year} · ${s.name}: ${formatCurrency(v)}`}</title></rect>;
                acc += v;
                return rect;
              })}
              {i % showEvery === 0 && <text x={x0 + slot * (i + 0.5)} y={h - 5} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">{monthShort(m)}</text>}
            </g>
          );
        })}
        {months.map((m, i) => (
          <MonthHit key={`hit-${m.year}-${m.month}`} x={x0 + slot * i} w={slot} h={h} i={i} inspect={inspect} open={() => openMonth(i)} label={`${monthLong(m)} ${m.year}: income ${formatCurrency(totals[i] ?? 0)}. Open income.`} />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
        {sources.map((s, i) => <Key key={`${s.categoryId}-${i}`} color={colorOf(s, i)} label={s.name} />)}
      </div>
    </div>
  );
}
