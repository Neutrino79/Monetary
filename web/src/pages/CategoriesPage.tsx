import { ListToolbar } from "@/components/list/ListToolbar";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Archive } from "lucide-react";
import type { Category, CategoryType } from "@/types";
import { useCategories, useDashboard, useIncomeSources } from "@/hooks/queries";
import { useCreateCategory, useUpdateCategory, useArchiveCategory } from "@/hooks/mutations";
import { ApiError } from "@/lib/api/errors";
import { useToast } from "@/components/ui/Toast";
import { Card, EmptyState, Skeleton, ProgressBar } from "@/components/ui/primitives";
import { CategoryChip, IncomeSourceChip } from "@/components/domain/chips";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Select, AmountInput, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils/format";

export function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: dashboard } = useDashboard();
  const budgetByCategory = useMemo(() => new Map((dashboard?.budgets ?? []).map((b) => [b.categoryId, b])), [dashboard]);
  const childrenOf = (id: number) => categories.filter((c) => c.parentId === id);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addIncomeOpen, setAddIncomeOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [archivingCategory, setArchivingCategory] = useState<Category | null>(null);
  const archiveCategory = useArchiveCategory();
  const toast = useToast();

  const roots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => !c.parentId)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || childrenOf(c.id).some((k) => k.name.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, search]);

  async function handleArchive() {
    if (!archivingCategory) return;
    try {
      await archiveCategory.mutateAsync(archivingCategory.id);
      toast.show(`${archivingCategory.type === "INCOME" ? "Income source" : "Category"} archived.`, { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  if (isLoading) {
    return (
      <div>
        <Skeleton className="mb-6 h-7 w-40" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">Organize spending into categories, and set monthly budgets on the ones that matter. Budget progress is for the current calendar month.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add category
        </Button>
      </div>

      <ListToolbar search={{ value: search, onChange: setSearch, placeholder: "Search categories…" }} />

      {roots.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No categories found" description="Try a different search, or add your first category." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {roots.map((root) => {
            const kids = childrenOf(root.id);
            const budget = budgetByCategory.get(root.id);
            const spent = budget?.spent ?? 0;
            const pct = budget ? Math.round(budget.percentageUsed) : null;
            return (
              <Card key={root.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CategoryChip category={root} />
                    <div>
                      <div className="text-[14.5px] font-semibold">{root.name}</div>
                      <div className="text-[12px] text-ink-faint">{kids.length} subcategor{kids.length === 1 ? "y" : "ies"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {root.budgetLimit != null && (
                      <div className="hidden w-40 sm:block">
                        <div className="mb-1 flex justify-between text-[11.5px] text-ink-faint">
                          <span>{formatCurrency(spent)}</span>
                          <span>{formatCurrency(root.budgetLimit)}</span>
                        </div>
                        <ProgressBar pct={pct ?? 0} color={pct && pct > 100 ? "var(--negative)" : pct && pct > 80 ? "var(--warn)" : "var(--accent)"} />
                      </div>
                    )}
                    <button aria-label="Edit category" onClick={() => setEditingCategory(root)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink">
                      <Pencil size={14} />
                    </button>
                    <button aria-label="Archive category" onClick={() => setArchivingCategory(root)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink">
                      <Archive size={14} />
                    </button>
                  </div>
                </div>
                {kids.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-dashed border-line pt-3">
                    {kids.map((k) => (
                      <span key={k.id} className="group flex items-center gap-1.5 rounded-full border border-line bg-paper-sunken px-2.5 py-1 text-[12px]">
                        {k.name}
                        <button aria-label={`Edit ${k.name}`} onClick={() => setEditingCategory(k)} className="text-ink-faint hover:text-ink">
                          <Pencil size={11} />
                        </button>
                        <button aria-label={`Archive ${k.name}`} onClick={() => setArchivingCategory(k)} className="text-ink-faint hover:text-ink">
                          <Archive size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[12.5px] font-bold uppercase tracking-wide text-ink-faint">Income sources</div>
          <Button variant="secondary" size="sm" onClick={() => setAddIncomeOpen(true)}>
            <Plus size={13} /> Add income source
          </Button>
        </div>
        <Card className="flex flex-wrap gap-3">
          {incomeSources.length === 0 && <span className="text-[12.5px] text-ink-faint">No income sources yet — add one to start recording income.</span>}
          {incomeSources.map((s) => (
            <span key={s.id} className="flex items-center gap-2 rounded-full border border-line bg-paper-sunken px-3 py-1.5 text-[12.5px]">
              <IncomeSourceChip source={s} size={22} /> {s.name}
              <button aria-label={`Edit ${s.name}`} onClick={() => setEditingCategory(s)} className="text-ink-faint hover:text-ink">
                <Pencil size={11} />
              </button>
              <button aria-label={`Archive ${s.name}`} onClick={() => setArchivingCategory(s)} className="text-ink-faint hover:text-ink">
                <Archive size={11} />
              </button>
            </span>
          ))}
        </Card>
      </div>

      <CategoryForm open={addOpen} onOpenChange={setAddOpen} type="EXPENSE" categories={categories} />
      <CategoryForm open={addIncomeOpen} onOpenChange={setAddIncomeOpen} type="INCOME" categories={categories} />
      <CategoryForm
        open={!!editingCategory}
        onOpenChange={(o) => !o && setEditingCategory(null)}
        type={editingCategory?.type ?? "EXPENSE"}
        editingCategory={editingCategory}
        categories={categories}
      />
      <ConfirmDialog
        open={!!archivingCategory}
        onOpenChange={(o) => !o && setArchivingCategory(null)}
        title={`Archive this ${archivingCategory?.type === "INCOME" ? "income source" : "category"}?`}
        message="Archived items stop showing up when adding transactions. Past transactions keep their category and history. Subcategories must be archived first."
        confirmLabel="Archive"
        variant="primary"
        onConfirm={handleArchive}
      />
    </div>
  );
}

function CategoryForm({
  open,
  onOpenChange,
  categories,
  type,
  editingCategory = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: CategoryType;
  categories: Category[];
  editingCategory?: Category | null;
}) {
  const isEdit = !!editingCategory;
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const toast = useToast();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const isIncome = type === "INCOME";
  const [budgetLimit, setBudgetLimit] = useState("");
  const [color, setColor] = useState("#5A5A5A");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // a category that already has subcategories can't itself become a subcategory (one level only)
  const hasChildren = editingCategory ? categories.some((c) => c.parentId === editingCategory.id) : false;
  const roots = categories.filter((c) => !c.parentId && c.id !== editingCategory?.id);

  useEffect(() => {
    if (!open) return;
    setName(editingCategory?.name ?? "");
    setParentId(editingCategory?.parentId ?? null);
    setBudgetLimit(editingCategory?.budgetLimit != null ? String(editingCategory.budgetLimit) : "");
    setColor(editingCategory?.color ?? "#5A5A5A");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingCategory]);

  async function submit() {
    if (!name.trim()) return setErrors({ name: "Enter a name." });
    const budget = budgetLimit.trim() === "" ? null : Number(budgetLimit);
    if (budget != null && (!Number.isFinite(budget) || budget < 0)) return setErrors({ budgetLimit: "Enter a valid budget." });
    setSaving(true);
    try {
      if (isEdit && editingCategory) {
        await updateCategory.mutateAsync({
          id: editingCategory.id,
          patch: { name: name.trim(), color, ...(isIncome ? {} : { parentId, budgetLimit: parentId ? null : budget }) },
        });
        toast.show("Saved.", { variant: "success" });
      } else {
        await createCategory.mutateAsync({
          name: name.trim(), type, color, ...(isIncome ? {} : { parentId, budgetLimit: parentId ? null : budget }),
        });
        toast.show(isIncome ? "Income source added." : "Category added.", { variant: "success" });
      }
      onOpenChange(false);
    } catch (e) {
      if (ApiError.isApiError(e) && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`${isEdit ? "Edit" : "Add"} ${isIncome ? "income source" : "category"}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" />
        </FormField>
        {!isIncome && (
        <FormField label="Parent category" hint={hasChildren ? "This category has subcategories, so it stays top-level." : "Leave as top-level to make this a main category with its own budget."}>
          <Select value={parentId ?? ""} disabled={hasChildren} onChange={(e) => setParentId(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">— Top-level category —</option>
            {roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>
        )}
        {!isIncome && !parentId && (
          <FormField label="Monthly budget (optional)" error={errors.budgetLimit}>
            <AmountInput value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} placeholder="0.00" />
          </FormField>
        )}
        <FormField label="Color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded-[10px] border border-line-strong bg-paper-raised" />
        </FormField>
      </div>
    </Modal>
  );
}
