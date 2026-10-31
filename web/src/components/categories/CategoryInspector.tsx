import { Link } from "react-router-dom";
import { Archive, Pencil, Plus } from "lucide-react";
import type { BudgetHistoryRow, Category, CategoryTrend, MonthRef, Transaction } from "@/types";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/primitives";
import { BUDGET_STEP, budgetAdvice, shareOf } from "@/lib/utils/budgetPlan";
import { formatCurrency } from "@/lib/utils/format";
import { monthShort } from "@/lib/utils/reportText";
import { cn } from "@/lib/utils/cn";

export interface SubSpend {
  id: number;
  name: string;
  spent: number;
}

const tone = (pct: number) => (pct > 100 ? "var(--negative)" : pct > 80 ? "var(--warn)" : "var(--accent)");

function Label({ children }: { children: React.ReactNode }) {
  return <SectionLabel>{children}</SectionLabel>;
}

/** Everything about one category, ready to edit: its budget, six months, subcategories, tags and latest spending. */
export function CategoryInspector({
  category,
  subs,
  spent,
  limit,
  saved,
  total,
  trend,
  months,
  history,
  startAt,
  recent,
  dirty,
  saving,
  onLimit,
  onSave,
  onUndo,
  onEdit,
  onArchive,
  onAddSub,
  onEditSub,
  onArchiveSub,
}: {
  category: Category;
  subs: SubSpend[];
  spent: number;
  limit: number | null;
  saved: number | null;
  total: number;
  trend?: CategoryTrend;
  months: MonthRef[];
  history?: BudgetHistoryRow;
  /** Where the first + tap lands when there is no limit yet. */
  startAt: number;
  recent: Transaction[];
  dirty: boolean;
  saving: boolean;
  onLimit: (next: number | null) => void;
  onSave: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onAddSub: () => void;
  onEditSub: (id: number) => void;
  onArchiveSub: (id: number) => void;
}) {
  const pct = limit && limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const series = trend?.points ?? [];
  const labels = months.slice(-series.length);
  const peak = Math.max(1, ...series, limit ?? 0) * 1.05;
  const held = limit === null ? 0 : series.filter((v) => v <= limit).length;
  const tags = [...new Set(recent.flatMap((t) => t.tags))].slice(0, 8);
  return (
    <div className="flex min-w-0 flex-col gap-5 rounded-card border border-line bg-paper-raised p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span aria-hidden className="h-10 w-10 shrink-0 rounded-card" style={{ background: category.color }} />
          <div>
            <h2 className="text-[19px] font-semibold">{category.name}</h2>
            <div className="text-caption text-ink-soft">{subs.length === 0 ? "Top level only" : `${subs.length} subcategor${subs.length === 1 ? "y" : "ies"}`}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onEdit}><Pencil size={14} /> Rename</Button>
          <Button variant="secondary" onClick={onArchive}><Archive size={14} /> Archive</Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5 rounded-card border border-line p-4">
          <Label>Monthly budget</Label>
          <div className="flex items-center gap-2.5">
            <button type="button" aria-label={`Lower budget by ${BUDGET_STEP}`} disabled={limit === null} onClick={() => onLimit(Math.max(BUDGET_STEP, (limit ?? 0) - BUDGET_STEP))} className="h-11 w-11 shrink-0 rounded-card border border-line text-[20px] font-semibold hover:bg-paper-sunken disabled:opacity-40">&minus;</button>
            {limit === null ? (
              <button type="button" onClick={() => onLimit(startAt)} className="h-11 flex-1 rounded-card border border-dashed border-line-strong text-body font-semibold text-accent hover:bg-paper-sunken">Set a limit ({formatCurrency(startAt)})</button>
            ) : (
              <input
                aria-label="Monthly budget"
                inputMode="decimal"
                type="number"
                min={0}
                value={limit}
                onChange={(e) => onLimit(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                className="h-11 w-0 min-w-0 flex-1 rounded-card border border-transparent bg-transparent text-center text-[26px] font-semibold tabular-nums hover:border-line focus:border-line-strong focus:outline-none"
              />
            )}
            <button type="button" aria-label={`Raise budget by ${BUDGET_STEP}`} onClick={() => onLimit(limit === null ? startAt : limit + BUDGET_STEP)} className="h-11 w-11 shrink-0 rounded-card border border-line text-[20px] font-semibold hover:bg-paper-sunken">+</button>
          </div>
          {limit !== null && (
            <>
              <div className="h-2.5 overflow-hidden rounded-full bg-paper-sunken"><div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: tone(pct) }} /></div>
              <div className="flex justify-between gap-2 text-caption">
                <span>{formatCurrency(spent)} spent · {pct}% used</span>
                <span className="text-ink-soft">{shareOf(limit, total)}% of your total</span>
              </div>
            </>
          )}
          <p className="text-caption leading-relaxed text-ink-soft">{budgetAdvice({ limit, saved, history, average: trend?.average ?? 0 })}</p>
          <div className="mt-auto flex gap-2">
            <Button className="flex-1" disabled={!dirty || saving} onClick={onSave}>{saving ? "Saving…" : dirty ? "Save budgets" : "All saved"}</Button>
            <Button variant="secondary" disabled={!dirty || saving} onClick={onUndo}>Undo</Button>
          </div>
          {limit !== null && <button type="button" onClick={() => onLimit(null)} className="self-start text-caption text-ink-faint underline-offset-2 hover:text-ink hover:underline">Remove this budget</button>}
        </div>

        <div className="rounded-card border border-line p-4">
          <Label>Last {series.length || 6} months{limit !== null ? " against this limit" : ""}</Label>
          {series.length === 0 ? (
            <p className="mt-3 text-caption text-ink-faint">No history yet.</p>
          ) : (
            <>
              <div className="relative mt-3 flex h-[110px] items-end gap-2.5 border-b border-line">
                {limit !== null && <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-ink-soft" style={{ bottom: `${(limit / peak) * 100}%` }} />}
                {series.map((v, i) => (
                  <div key={i} className="flex h-full flex-1 items-end" title={`${labels[i] ? monthShort(labels[i]!) : ""}: ${formatCurrency(v)}`}>
                    <div className="w-full rounded-t-[4px]" style={{ height: `${Math.round((v / peak) * 100)}%`, background: limit !== null && v > limit ? "var(--negative)" : i === series.length - 1 ? "var(--accent)" : "color-mix(in srgb, var(--accent) 40%, var(--paper-raised))" }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2.5">{series.map((_, i) => <span key={i} className="flex-1 text-center text-micro text-ink-faint">{labels[i] ? monthShort(labels[i]!) : ""}</span>)}</div>
              {limit !== null && <div className="mt-2 text-caption text-ink-soft">Would have held in {held} of {series.length} months.</div>}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-body font-semibold">
            <span>Subcategories</span>
            <button type="button" onClick={onAddSub} className="flex items-center gap-1 text-accent hover:underline"><Plus size={13} /> Add</button>
          </div>
          {subs.length === 0 && <div className="border-t border-dashed border-line py-2 text-caption text-ink-faint">No subcategories yet.</div>}
          {subs.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 border-t border-dashed border-line py-2 text-body">
              <span className="min-w-0 truncate">{s.name}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-ink-soft">{formatCurrency(s.spent)}</span>
                <button type="button" aria-label={`Edit ${s.name}`} onClick={() => onEditSub(s.id)} className="text-ink-faint hover:text-ink"><Pencil size={12} /></button>
                <button type="button" aria-label={`Archive ${s.name}`} onClick={() => onArchiveSub(s.id)} className="text-ink-faint hover:text-ink"><Archive size={12} /></button>
              </span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 text-body font-semibold">Tags used here</div>
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 && <span className="text-caption text-ink-faint">None on recent spending.</span>}
            {tags.map((t) => <Link key={t} to={`/transactions?tag=${encodeURIComponent(t)}`} className="rounded-full bg-paper-sunken px-2.5 py-1 text-caption text-ink-soft hover:text-ink">#{t}</Link>)}
          </div>
          <div className="mb-1.5 mt-4 flex items-center justify-between text-body font-semibold">
            <span>Latest</span>
            <Link to={`/expenses?category=${category.id}`} className="text-caption font-medium text-accent hover:underline">See all</Link>
          </div>
          {recent.length === 0 && <div className="border-t border-dashed border-line py-2 text-caption text-ink-faint">No spending recorded yet.</div>}
          {recent.slice(0, 4).map((t) => (
            <div key={t.id} className={cn("flex justify-between gap-2 border-t border-dashed border-line py-1.5 text-body")}>
              <span className="min-w-0 truncate">{t.description}</span>
              <span className="tabular-nums text-ink-soft">{formatCurrency(t.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
