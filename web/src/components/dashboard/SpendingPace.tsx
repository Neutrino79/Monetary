import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SpendingPace as Pace } from "@/types";
import { useElementWidth } from "@/hooks/useElementWidth";
import { useInspect } from "@/hooks/useInspect";
import { dayTicks, niceAxis } from "@/lib/utils/chartAxis";
import { formatCompact, formatCurrency } from "@/lib/utils/format";
import { paceHeadline } from "@/lib/utils/paceHeadline";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

/**
 * Spending pace: the running total of what you've spent, day by day, against your budget and the month
 * before. For the current month it carries on as a dotted line (with a range) to where the month should end.
 * Hover a day (or tap it on a phone) for the numbers; click (or tap again) to see that day's transactions.
 */
export function SpendingPace({ pace, month, monthName }: { pace: Pace; month: string; monthName: string }) {
  const navigate = useNavigate();
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const narrow = width < 460;
  const H = narrow ? 210 : 240;
  const P = { l: narrow ? 42 : 48, r: 14, t: 16, b: 26 };
  const N = pace.daysInMonth;
  const elapsed = pace.elapsedDays;
  const proj = pace.projection;

  const peak = Math.max(
    pace.budgetTotal ?? 0,
    ...pace.days.map((d) => d.cumulative),
    ...pace.previous.slice(0, N),
    ...(proj ? proj.days.map((d) => d.high) : []),
  );
  const axis = niceAxis(peak * 1.04);
  const innerW = Math.max(1, width - P.l - P.r);
  const innerH = H - P.t - P.b;
  const xAt = (d: number) => P.l + ((d - 1) / Math.max(1, N - 1)) * innerW;
  const yAt = (v: number) => P.t + innerH - (v / axis.max) * innerH;
  const step = innerW / Math.max(1, N - 1);

  const open = (day: number) => {
    if (day <= elapsed) navigate(`/transactions?date=${month}-${pad(day)}`);
  };
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const inspect = useInspect<number>(open, root);
  const active = inspect.active;

  const cumulative = pace.days.map((d) => d.cumulative);
  const spentNow = cumulative.length ? cumulative[cumulative.length - 1] : 0;
  const actual: [number, number][] = pace.days.map((d) => [xAt(d.day), yAt(d.cumulative)]);
  const future: [number, number][] = proj ? [[xAt(elapsed), yAt(spentNow)], ...proj.days.map((d): [number, number] => [xAt(d.day), yAt(d.expected)])] : [];
  const band = proj && proj.method === "history"
    ? [[xAt(elapsed), yAt(spentNow)] as [number, number], ...proj.days.map((d): [number, number] => [xAt(d.day), yAt(d.high)]), ...[...proj.days].reverse().map((d): [number, number] => [xAt(d.day), yAt(d.low)])]
    : null;
  const previous: [number, number][] = pace.previous.slice(0, N).map((v, i) => [xAt(i + 1), yAt(v)]);
  const prevName = MONTHS[Number(pace.previousMonth.slice(5, 7)) - 1];
  const monthIdx = pace.month - 1;
  const weekday = (day: number) => WEEKDAYS[new Date(pace.year, monthIdx, day).getDay()];

  // the numbers for whichever day is being inspected
  let tip: { x: number; y: number; lines: string[]; solid: boolean } | null = null;
  if (active !== null) {
    const isPast = active <= elapsed;
    const v = isPast ? cumulative[active - 1] : proj?.days.find((d) => d.day === active)?.expected;
    if (v !== undefined) {
      const prev = pace.previous[Math.min(active, pace.previous.length) - 1];
      const lines = isPast
        ? [`${weekday(active)} ${active} ${MONTHS[monthIdx]}`, `Spent so far ${formatCurrency(v)}`, `That day ${formatCurrency(pace.days[active - 1].spent)}${prev !== undefined ? ` · ${prevName} ${formatCurrency(prev)}` : ""}`]
        : [`${weekday(active)} ${active} ${MONTHS[monthIdx]} · expected`, `About ${formatCurrency(v)} by then`, band ? `Likely ${formatCurrency(proj!.days.find((d) => d.day === active)!.low)} – ${formatCurrency(proj!.days.find((d) => d.day === active)!.high)}` : "A steady pace from here"];
      if (inspect.touch && isPast) lines.push("Tap again to see that day");
      const w = 196, h = 16 + lines.length * 17;
      const px = xAt(active), py = yAt(v);
      tip = { x: Math.min(Math.max(px - w / 2, 4), width - w - 4), y: py - h - 14 < 2 ? py + 14 : py - h - 14, lines, solid: isPast };
    }
  }
  const activeV = active === null ? null : active <= elapsed ? cumulative[active - 1] : proj?.days.find((d) => d.day === active)?.expected ?? null;

  const onKey = (e: React.KeyboardEvent) => {
    const from = active ?? elapsed ?? 1;
    const last = proj ? N : Math.max(1, elapsed);
    if (e.key === "ArrowRight") inspect.setActive(Math.min(last, from + 1));
    else if (e.key === "ArrowLeft") inspect.setActive(Math.max(1, from - 1));
    else if (e.key === "Home") inspect.setActive(1);
    else if (e.key === "End") inspect.setActive(last);
    else if (e.key === "Enter" && active !== null) open(active);
    else if (e.key === "Escape") inspect.setActive(null);
    else return;
    e.preventDefault();
  };

  const summary = `Cumulative spending by day for ${monthName}. ${formatCurrency(spentNow)} spent${proj ? `, expected to end near ${formatCurrency(proj.expected)}` : ""}${pace.budgetTotal != null ? `, against a ${formatCurrency(pace.budgetTotal)} budget` : ""}.`;
  const headline = paceHeadline(pace, monthName);
  const dotR = narrow ? 2.1 : 2.7;

  return (
    <div ref={setRoot}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold">Spending pace</h2>
          <p className={cn("mt-0.5 text-[13px]", headline.tone === "good" ? "text-accent" : headline.tone === "bad" ? "text-negative" : "text-ink-soft")} data-testid="pace-headline">
            {headline.text}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-[12px] text-ink-soft" aria-label="Key">
          <li className="flex items-center gap-1.5"><span aria-hidden className="w-3.5 border-t-[3px] border-negative" />{pace.isCurrentMonth ? "This month" : monthName}</li>
          {proj && <li className="flex items-center gap-1.5"><span aria-hidden className="w-3.5 border-t-[3px] border-dotted border-negative" />Expected</li>}
          {previous.length > 0 && <li className="flex items-center gap-1.5"><span aria-hidden className="w-3.5 border-t-2 border-line-strong" />{prevName}</li>}
          {pace.budgetTotal != null && <li className="flex items-center gap-1.5"><span aria-hidden className="w-3.5 border-t-2 border-dashed border-ink" />Budget</li>}
        </ul>
      </div>

      <div ref={ref} tabIndex={0} role="group" aria-label={`${summary} Use the arrow keys to move between days.`} onKeyDown={onKey} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) inspect.setActive(null); }} className="mt-2 rounded-[10px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring">
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block touch-pan-y select-none" aria-hidden onPointerLeave={(e) => { if (e.pointerType !== "touch") inspect.setActive(null); }}>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line x1={P.l} x2={width - P.r} y1={yAt(t)} y2={yAt(t)} stroke="var(--line)" />
              <text x={P.l - 6} y={yAt(t) + 3.5} textAnchor="end" className="fill-ink-faint text-[10.5px]">{t === 0 ? "0" : formatCompact(t)}</text>
            </g>
          ))}
          {dayTicks(N, narrow).map((d) => (
            <text key={d} x={xAt(d)} y={H - 7} textAnchor="middle" className="fill-ink-faint text-[10.5px]">{d === 1 ? `1 ${MONTHS[monthIdx]}` : d}</text>
          ))}

          {pace.budgetTotal != null && (
            <g>
              <line x1={P.l} x2={width - P.r} y1={yAt(pace.budgetTotal)} y2={yAt(pace.budgetTotal)} stroke="var(--ink)" strokeWidth={1.3} strokeDasharray="6 5" />
              <text x={width - P.r} y={yAt(pace.budgetTotal) - 6} textAnchor="end" className="fill-ink text-[10.5px] font-semibold">Budget {formatCurrency(pace.budgetTotal)}</text>
            </g>
          )}
          {previous.length > 1 && <path d={path(previous)} fill="none" stroke="var(--line-strong)" strokeWidth={2} strokeLinejoin="round" />}
          {band && <path d={`${path(band)} Z`} fill="var(--negative)" fillOpacity={0.1} />}
          {future.length > 1 && <path d={path(future)} fill="none" stroke="var(--negative)" strokeWidth={2.2} strokeDasharray="2 5" strokeLinecap="round" />}
          {actual.length > 1 && <path d={path(actual)} fill="none" stroke="var(--negative)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />}
          {proj && proj.days.map((d) => <circle key={d.day} cx={xAt(d.day)} cy={yAt(d.expected)} r={dotR} fill="var(--paper-raised)" stroke="var(--negative)" strokeWidth={1.4} />)}
          {actual.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={dotR} fill="var(--negative)" stroke="var(--paper-raised)" strokeWidth={1} />)}

          {pace.isCurrentMonth && elapsed > 0 && active === null && (
            <g>
              <line x1={xAt(elapsed)} x2={xAt(elapsed)} y1={P.t - 4} y2={H - P.b} stroke="var(--ink)" strokeOpacity={0.25} strokeDasharray="3 4" />
              <circle cx={xAt(elapsed)} cy={yAt(spentNow)} r={5.5} fill="var(--negative)" stroke="var(--paper-raised)" strokeWidth={2.2} />
            </g>
          )}
          {proj && (
            <text x={width - P.r} y={yAt(proj.high) - 8} textAnchor="end" className="fill-negative text-[10.5px] font-semibold">
              {`≈ ${formatCurrency(proj.expected)}${proj.method === "history" && proj.low !== proj.high ? ` (${formatCurrency(proj.low)} – ${formatCurrency(proj.high)})` : ""}`}
            </text>
          )}

          {active !== null && activeV !== null && (
            <g pointerEvents="none">
              <line x1={xAt(active)} x2={xAt(active)} y1={P.t - 4} y2={H - P.b} stroke="var(--ink)" strokeOpacity={0.35} />
              <circle cx={xAt(active)} cy={yAt(activeV)} r={6} fill={active <= elapsed ? "var(--negative)" : "var(--paper-raised)"} stroke="var(--negative)" strokeWidth={2.5} />
            </g>
          )}
          {tip && (
            <g pointerEvents="none" data-testid="pace-tooltip">
              <rect x={tip.x} y={tip.y} width={196} height={16 + tip.lines.length * 17} rx={8} fill="var(--ink)" />
              {tip.lines.map((l, i) => (
                <text key={i} x={tip!.x + 10} y={tip!.y + 18 + i * 17} className={cn("text-[11px]", i === 0 ? "fill-paper font-semibold" : "fill-paper opacity-85")}>{l}</text>
              ))}
            </g>
          )}

          {Array.from({ length: N }, (_, i) => i + 1).map((d) => (
            <rect
              key={d}
              data-testid={`pace-day-${d}`}
              x={xAt(d) - step / 2}
              y={0}
              width={step}
              height={H - P.b}
              fill="transparent"
              className={d <= elapsed ? "cursor-pointer" : ""}
              {...inspect.itemProps(d)}
            />
          ))}
        </svg>
      </div>

      <PaceFacts pace={pace} spent={spentNow} />
    </div>
  );
}

/** The four small figures under the chart; any that can't be worked out are left out rather than shown blank. */
function PaceFacts({ pace, spent }: { pace: Pace; spent: number }) {
  const elapsed = pace.elapsedDays;
  const left = pace.budgetTotal != null ? pace.budgetTotal - spent : null;
  const daysLeft = pace.daysInMonth - elapsed;
  const facts: { label: string; value: string; tone?: string }[] = [];
  if (left != null) facts.push({ label: left >= 0 ? "Left in budget" : "Over budget by", value: formatCurrency(Math.abs(left)), tone: left < 0 ? "text-negative" : undefined });
  if (pace.isCurrentMonth && left != null && left > 0 && daysLeft > 0) facts.push({ label: "Safe per day", value: formatCurrency(left / daysLeft) });
  if (elapsed > 0 && spent > 0) facts.push({ label: "Daily average", value: formatCurrency(spent / elapsed) });
  const same = elapsed > 0 ? pace.previous[Math.min(elapsed, pace.previous.length) - 1] : undefined;
  if (same !== undefined && same > 0) facts.push({ label: pace.isCurrentMonth ? `Same day in ${MONTHS[Number(pace.previousMonth.slice(5, 7)) - 1]}` : `${MONTHS[Number(pace.previousMonth.slice(5, 7)) - 1]} in total`, value: formatCurrency(pace.isCurrentMonth ? same : pace.previous[pace.previous.length - 1]) });
  if (facts.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-4">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-[12px] text-ink-soft">{f.label}</dt>
          <dd className={cn("ledger-figure text-[17px]", f.tone)}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One quiet line for a budget-less month: how to make the chart more useful. */
export function SetBudgetHint() {
  return (
    <p className="mt-2 text-[12.5px] text-ink-soft">
      Set a budget to see how you're pacing. <Link to="/categories" className="font-semibold text-ink underline-offset-2 hover:underline">Add budgets</Link>
    </p>
  );
}
