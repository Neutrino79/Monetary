import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Category } from "@/types";
import { useBudgetHistory, useCategories, useCategoriesReport, useSpending, useTransactions } from "@/hooks/queries";
import { useArchiveCategory, useUpdateCategory } from "@/hooks/mutations";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Card, EmptyState } from "@/components/ui/primitives";
import { SkeletonChart, SkeletonList } from "@/components/ui/skeletons";
import { CategoryForm } from "@/components/domain/CategoryForm";
import { planSummary, startingLimit, type PlanItem } from "@/lib/utils/budgetPlan";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { CategoryInspector } from "./CategoryInspector";
import { TotalBudgetBar } from "./TotalBudgetBar";

/** Budgets are set on top-level categories; this is the whole plan, with each category one tap away. */
export function CategoriesPanel() {
  const { data: categories = [], isLoading } = useCategories();
  const spending = useSpending();
  const report = useCategoriesReport(6, "spending");
  const history = useBudgetHistory(6);
  const update = useUpdateCategory();
  const archive = useArchiveCategory();
  const toast = useToast();

  const [picked, setPicked] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  /** Limits changed but not saved yet. null means "remove the budget". */
  const [draft, setDraft] = useState<Record<number, number | null>>({});
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ edit: Category | null; parentId: number | null } | null>(null);
  const [archiving, setArchiving] = useState<Category | null>(null);

  const roots = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const spentBy = useMemo(() => new Map((spending.data ?? []).map((s) => [s.categoryId, s])), [spending.data]);
  const trendBy = useMemo(() => new Map((report.data?.categories ?? []).map((t) => [t.categoryId, t])), [report.data]);
  const historyBy = useMemo(() => new Map((history.data?.budgets ?? []).map((b) => [b.categoryId, b])), [history.data]);
  const unbudgetedBy = useMemo(() => new Map((history.data?.unbudgeted ?? []).map((u) => [u.categoryId, u])), [history.data]);

  const limitOf = (c: Category): number | null => (c.id in draft ? draft[c.id]! : c.budgetLimit);
  const items: PlanItem[] = roots.map((c) => ({ id: c.id, spent: spentBy.get(c.id)?.total ?? 0, saved: c.budgetLimit, limit: limitOf(c) }));
  const summary = planSummary(items);

  // most spent first, so the page opens on what matters
  const ordered = [...roots].sort((a, b) => (spentBy.get(b.id)?.total ?? 0) - (spentBy.get(a.id)?.total ?? 0));
  const shown = ordered.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || categories.some((k) => k.parentId === c.id && k.name.toLowerCase().includes(q));
  });
  const selected = roots.find((c) => c.id === picked) ?? shown[0] ?? roots[0] ?? null;
  const selectedId = selected?.id ?? null;

  const recent = useTransactions({ type: ["expense"], categoryId: selectedId ?? undefined, sort: "date", direction: "desc", limit: 20 }, selectedId !== null);

  const dirtyIds = roots.filter((c) => c.id in draft && draft[c.id] !== c.budgetLimit).map((c) => c.id);
  const setLimit = (c: Category, next: number | null) =>
    setDraft((d) => {
      const n = { ...d };
      if (next === c.budgetLimit) delete n[c.id];
      else n[c.id] = next;
      return n;
    });

  async function save() {
    setSaving(true);
    try {
      for (const id of dirtyIds) await update.mutateAsync({ id, patch: { budgetLimit: draft[id] ?? null } });
      setDraft({});
      toast.show(dirtyIds.length === 1 ? "Budget saved." : `${dirtyIds.length} budgets saved.`, { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiving) return;
    try {
      await archive.mutateAsync(archiving.id);
      toast.show("Category archived.", { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  if (isLoading) return <div className="space-y-4"><SkeletonChart height={90} /><div className="rounded-card border border-line bg-paper-raised p-5"><SkeletonList rows={6} /></div></div>;

  const segments = ordered
    .map((c) => ({ id: c.id, name: c.name, color: c.color, limit: limitOf(c), spent: spentBy.get(c.id)?.total ?? 0 }))
    .filter((s): s is typeof s & { limit: number } => s.limit !== null && s.limit > 0);
  const subs = selected ? categories.filter((c) => c.parentId === selected.id) : [];
  const selSpend = selected ? spentBy.get(selected.id) : undefined;
  const subSpent = new Map((selSpend?.children ?? []).map((k) => [k.categoryId, k.total]));
  const months = report.data?.seriesMonths ?? [];

  return (
    <div className="space-y-5">
      <TotalBudgetBar segments={segments} summary={summary} selectedId={selectedId} onSelect={setPicked} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="p-2.5">
          <div className="mb-1.5 flex items-center gap-2 border-b border-line px-2.5 pb-2 pt-1">
            <Search size={14} className="shrink-0 text-ink-faint" aria-hidden />
            <input aria-label="Search categories" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories" className="min-w-0 flex-1 bg-transparent text-body placeholder:text-ink-faint focus:outline-none" />
            <Button size="sm" onClick={() => setForm({ edit: null, parentId: null })}><Plus size={13} /> Add category</Button>
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={Search} title="No categories found" description="Try a different search, or add your first category." />
          ) : (
            <ul>
              {shown.map((c) => {
                const spent = spentBy.get(c.id)?.total ?? 0;
                const limit = limitOf(c);
                const pct = limit ? Math.round((spent / limit) * 100) : 0;
                const kids = categories.filter((k) => k.parentId === c.id).length;
                const on = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setPicked(c.id)} aria-pressed={on} className={cn("flex min-h-[52px] w-full items-center gap-3 rounded-card px-3 py-2 text-left hover:bg-paper-sunken", on && "bg-accent-soft hover:bg-accent-soft")}>
                      <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: c.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{c.name}</span>
                        <span className="block text-caption text-ink-faint">{kids === 0 ? "Top level only" : `${kids} subcategor${kids === 1 ? "y" : "ies"}`}</span>
                      </span>
                      <span className="w-[76px] shrink-0 text-right">
                        <span className="block text-caption font-semibold tabular-nums">{limit === null ? "No budget" : formatCurrency(limit)}</span>
                        <span className="mt-1 block h-[5px] overflow-hidden rounded-full bg-paper-sunken">
                          <span className="block h-full" style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? "var(--negative)" : pct > 80 ? "var(--warn)" : "var(--accent)" }} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {selected ? (
          <CategoryInspector
            category={selected}
            subs={subs.map((k) => ({ id: k.id, name: k.name, spent: subSpent.get(k.id) ?? 0 }))}
            spent={selSpend?.total ?? 0}
            limit={limitOf(selected)}
            saved={selected.budgetLimit}
            total={summary.total}
            trend={trendBy.get(selected.id)}
            months={months}
            history={historyBy.get(selected.id)}
            startAt={startingLimit(selSpend?.total ?? 0, unbudgetedBy.get(selected.id)?.suggestion.period === "month" ? unbudgetedBy.get(selected.id)?.suggestion.limit : null)}
            recent={recent.data?.items ?? []}
            dirty={dirtyIds.length > 0}
            saving={saving}
            onLimit={(n) => setLimit(selected, n)}
            onSave={save}
            onUndo={() => setDraft({})}
            onEdit={() => setForm({ edit: selected, parentId: null })}
            onArchive={() => setArchiving(selected)}
            onAddSub={() => setForm({ edit: null, parentId: selected.id })}
            onEditSub={(id) => setForm({ edit: categories.find((k) => k.id === id) ?? null, parentId: null })}
            onArchiveSub={(id) => setArchiving(categories.find((k) => k.id === id) ?? null)}
          />
        ) : (
          <Card><EmptyState icon={Plus} title="No categories yet" description="Add your first category to start tracking and budgeting." /></Card>
        )}
      </div>

      <CategoryForm open={form !== null} onOpenChange={(o) => !o && setForm(null)} type="EXPENSE" categories={categories} editingCategory={form?.edit ?? null} defaultParentId={form?.parentId ?? null} />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title="Archive this category?"
        message="Archived items stop showing up when adding transactions. Past transactions keep their category and history. Subcategories must be archived first."
        confirmLabel="Archive"
        variant="primary"
        onConfirm={confirmArchive}
      />
    </div>
  );
}
