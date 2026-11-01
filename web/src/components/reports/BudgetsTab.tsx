import { Link, useNavigate } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import type { BudgetHistory, BudgetHistoryRow, UnbudgetedCategory } from "@/types";
import { Card, EmptyState, LoadFailed } from "@/components/ui/primitives";
import { SkeletonReport } from "@/components/ui/skeletons";
import { Button } from "@/components/ui/Button";
import { useBudgetHistory } from "@/hooks/queries";
import { useUpdateCategory } from "@/hooks/mutations";
import { useElementWidth } from "@/hooks/useElementWidth";
import { linear, niceCeil } from "@/lib/utils/chartMath";
import { formatCompact, formatCurrency } from "@/lib/utils/format";
import { monthKey, monthShort } from "@/lib/utils/reportText";
import { categoryMonthLink, monthLink } from "@/lib/utils/reportLinks";
import { cn } from "@/lib/utils/cn";

/** Shade of a month by how much of the limit was used: under 60%, 60-85, 85-100, over. */
function shade(spent: number, limit: number): string {
  const p = limit > 0 ? (spent / limit) * 100 : 0;
  if (p > 100) return "bg-negative";
  if (p >= 85) return "bg-warn";
  if (p >= 60) return "bg-accent/60";
  return "bg-accent/25";
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-paper-raised p-3.5">
      <div className="text-caption text-ink-faint">{label}</div>
      <div className="mt-1 truncate text-[18px] font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-micro leading-snug text-ink-faint">{hint}</div>}
    </div>
  );
}

function TotalsChart({ h }: { h: BudgetHistory }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const navigate = useNavigate();
  const H = 150;
  const m = { l: 44, r: 8, t: 8, b: 22 };
  const peak = niceCeil(Math.max(1, h.limitTotal, ...h.monthTotals.map((t) => t.spent)));
  const y = linear(0, peak, H - m.b, m.t);
  const slot = (width - m.l - m.r) / Math.max(1, h.monthTotals.length);
  const bw = Math.max(6, Math.min(30, slot * 0.6));
  const every = slot < 30 ? 2 : 1;
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={H} role="img" aria-label="Total spending in budgeted categories against the combined limit">
        <text x={m.l - 6} y={y(peak) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-faint)">{formatCompact(peak)}</text>
        <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        {h.monthTotals.map((t, i) => {
          const cx = m.l + slot * (i + 0.5);
          return (
            <g
              key={`${t.year}-${t.month}`}
              opacity={t.isPartial ? 0.55 : 1}
              role="link"
              tabIndex={0}
              aria-label={`${monthShort(t)} ${t.year}: ${formatCurrency(t.spent)} of ${formatCurrency(h.limitTotal)}. Open expenses.`}
              className="cursor-pointer outline-none hover:opacity-80 focus-visible:opacity-80"
              onClick={() => navigate(monthLink(monthKey(t), "spending"))}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(monthLink(monthKey(t), "spending")); }}
            >
              <rect x={cx - slot / 2} width={slot} y={m.t} height={H - m.t - m.b} fill="transparent" />
              <title>{`${monthShort(t)} ${t.year}: ${formatCurrency(t.spent)} of ${formatCurrency(h.limitTotal)}`}</title>
              <rect x={cx - bw / 2} width={bw} y={y(t.spent)} height={Math.max(0, y(0) - y(t.spent))} rx={2} fill={t.spent > h.limitTotal ? "var(--negative)" : "var(--accent)"} />
              {i % every === 0 && <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">{monthShort(t)}</text>}
            </g>
          );
        })}
        <line x1={m.l} x2={width - m.r} y1={y(h.limitTotal)} y2={y(h.limitTotal)} stroke="var(--ink)" strokeDasharray="5 4" />
        <text x={width - m.r} y={y(h.limitTotal) - 4} textAnchor="end" fontSize={10.5} fill="var(--ink)">Limit {formatCompact(h.limitTotal)}</text>
      </svg>
    </div>
  );
}

/** Budgets are monthly; a lumpy category suggests a yearly total, spread over 12 months. */
const monthlyLimit = (u: UnbudgetedCategory) => (u.suggestion.period === "year" ? Math.round(u.suggestion.limit / 12) : u.suggestion.limit);

const SUGGEST_LABEL = { raise: "Raise to", tighten: "Tighten to", keep: "Fits" } as const;

function BudgetRow({ b, monthLabels, monthKeys, busy, onApply }: { b: BudgetHistoryRow; monthLabels: string[]; monthKeys: string[]; busy: boolean; onApply: (limit: number) => void }) {
  const s = b.suggestion;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="truncate text-body font-semibold">{b.name}</div>
          <div className="text-caption text-ink-faint">Limit {formatCurrency(b.limit)} · held {b.held} of {b.completeMonths} · typical use {Math.round(b.typicalPct)}%</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-micro font-semibold", s.action === "raise" ? "bg-negative/10 text-negative" : s.action === "tighten" ? "bg-info/10 text-info" : "bg-accent/10 text-accent")}>
            {SUGGEST_LABEL[s.action]}{s.action === "keep" ? "" : ` ${formatCurrency(s.limit)}`}
          </span>
          {s.action !== "keep" && <Button variant="secondary" disabled={busy} onClick={() => onApply(s.limit)} aria-label={`Apply ${formatCurrency(s.limit)} to ${b.name}`}>Apply</Button>}
        </div>
      </div>
      <ul className="mt-2 flex gap-1" aria-label={`${b.name} month by month`}>
        {b.points.map((p, i) => (
          <li key={i} className="min-w-0 flex-1">
            <Link to={categoryMonthLink("spending", b.categoryId, monthKeys[i] ?? "")} title={`${monthLabels[i] ?? ""}: ${formatCurrency(p)} of ${formatCurrency(b.limit)}`} aria-label={`${b.name}, ${monthLabels[i] ?? ""}: ${formatCurrency(p)} of ${formatCurrency(b.limit)}. Open transactions.`} className={cn("block h-5 rounded-[3px] ring-ink hover:ring-2 focus-visible:ring-2", shade(p, b.limit))} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export function BudgetsTab({ months }: { months: number }) {
  const q = useBudgetHistory(months);
  const update = useUpdateCategory();
  if (q.isLoading) return <SkeletonReport />;
  const h = q.data;
  if (q.isError || !h) return <LoadFailed what="budgets" error={q.error} onRetry={() => q.refetch()} />;
  if (h.budgets.length === 0 && h.unbudgeted.length === 0) return <EmptyState icon={BarChart3} title="No budgets yet" description="Set a limit on a category and its history shows up here." />;
  const labels = h.monthTotals.map((t) => `${monthShort(t)} ${t.year}`);
  const keys = h.monthTotals.map(monthKey);
  const tightest = [...h.budgets].sort((a, b) => b.typicalPct - a.typicalPct)[0];
  const room = h.budgets.filter((b) => b.suggestion.action === "tighten").reduce((a, b) => a + (b.limit - b.suggestion.limit), 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Months held" value={h.budgetMonths > 0 ? `${h.held} of ${h.budgetMonths}` : "—"} hint="Budget-months within the limit" />
        <Kpi label="Tightest budget" value={tightest ? tightest.name : "—"} hint={tightest ? `typically ${Math.round(tightest.typicalPct)}% used` : undefined} />
        <Kpi label="Room to free" value={formatCurrency(room)} hint="If you tighten the ones that allow it" />
        <Kpi label="Coverage" value={h.coveragePct === null ? "—" : `${Math.round(h.coveragePct)}%`} hint="Of spending that has a budget" />
      </div>
      {h.budgets.length > 0 && (
        <Card>
          <div className="text-lead font-semibold">All budgets together</div>
          <div className="mb-3 text-caption text-ink-faint">Spending in budgeted categories against the combined limit.</div>
          <TotalsChart h={h} />
        </Card>
      )}
      {h.budgets.length > 0 && (
        <Card>
          <div className="text-lead font-semibold">Budget by budget</div>
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-faint">
            Each square is a month, oldest first.
            {([["bg-accent/25", "under 60%"], ["bg-accent/60", "60–85%"], ["bg-warn", "85–100%"], ["bg-negative", "over"]] as const).map(([c, t]) => <span key={t} className="flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-[2px]", c)} />{t}</span>)}
          </div>
          <ul className="divide-y divide-dashed divide-line">
            {h.budgets.map((b) => <BudgetRow key={b.categoryId} b={b} monthLabels={labels} monthKeys={keys} busy={update.isPending} onApply={(limit) => update.mutate({ id: b.categoryId, patch: { budgetLimit: limit } })} />)}
          </ul>
        </Card>
      )}
      {h.unbudgeted.length > 0 && (
        <Card>
          <div className="text-lead font-semibold">Spending with no budget</div>
          <div className="mb-2 text-caption text-ink-faint">Suggested from what these categories usually cost. Budgets are monthly, so lumpy ones are spread: a yearly total divided by 12.</div>
          <ul className="divide-y divide-dashed divide-line">
            {h.unbudgeted.map((u) => (
              <li key={u.categoryId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-body font-medium">{u.name}</div>
                  <div className="text-caption text-ink-faint">{formatCurrency(u.average)} a month on average · peak {formatCurrency(u.peak)}</div>
                </div>
                <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ id: u.categoryId, patch: { budgetLimit: monthlyLimit(u) } })} aria-label={`Set ${u.name} budget to ${formatCurrency(monthlyLimit(u))} a month`}>
                  Set {formatCurrency(monthlyLimit(u))} / mo
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
