import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import type { Category } from "@/types";
import { useCategories, useIncomeSources } from "@/hooks/queries";
import { useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/mutations";
import { useLedgerCalc } from "@/hooks/useLedgerCalc";
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
  const calc = useLedgerCalc();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const deleteCategory = useDeleteCategory();
  const toast = useToast();

  const roots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => !c.parentId)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || calc.categoryChildren(c.id).some((k) => k.name.toLowerCase().includes(q)));
  }, [categories, search, calc]);

  async function handleDelete() {
    if (!deletingCategory) return;
    try {
      await deleteCategory.mutateAsync(deletingCategory.id);
      toast.show("Category deleted.", { variant: "success" });
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

  const range = calc.monthRange(1);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">Organize spending into categories, and set monthly budgets on the ones that matter.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add category
        </Button>
      </div>

      <div className="mb-5 flex items-center gap-2 rounded-[10px] bg-paper-raised border border-line px-3 py-2 max-w-sm">
        <Search size={15} className="text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" className="flex-1 bg-transparent text-[13.3px] outline-none" />
      </div>

      {roots.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No categories found" description="Try a different search, or add your first category." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {roots.map((root) => {
            const kids = calc.categoryChildren(root.id);
            const spent = calc.calcCategorySpend(root.id, range);
            const pct = root.budgetLimit ? Math.round((spent / root.budgetLimit) * 100) : null;
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
                    <button aria-label="Delete category" onClick={() => setDeletingCategory(root)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger">
                      <Trash2 size={14} />
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
        <div className="mb-3 text-[12.5px] font-bold uppercase tracking-wide text-ink-faint">Income sources</div>
        <Card className="flex flex-wrap gap-3">
          {incomeSources.map((s) => (
            <span key={s.id} className="flex items-center gap-2 rounded-full border border-line bg-paper-sunken px-3 py-1.5 text-[12.5px]">
              <IncomeSourceChip source={s} size={22} /> {s.name}
            </span>
          ))}
        </Card>
      </div>

      <CategoryForm open={addOpen} onOpenChange={setAddOpen} categories={categories} />
      <CategoryForm open={!!editingCategory} onOpenChange={(o) => !o && setEditingCategory(null)} editingCategory={editingCategory} categories={categories} />
      <ConfirmDialog
        open={!!deletingCategory}
        onOpenChange={(o) => !o && setDeletingCategory(null)}
        title="Delete this category?"
        message="Any subcategories underneath it are deleted too. Past transactions keep their record but lose this category reference."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CategoryForm({
  open,
  onOpenChange,
  categories,
  editingCategory = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Category[];
  editingCategory?: Category | null;
}) {
  const isEdit = !!editingCategory;
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const toast = useToast();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [color, setColor] = useState("#5A5A5A");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const roots = categories.filter((c) => !c.parentId && c.id !== editingCategory?.id);

  useEffect(() => {
    if (!open) return;
    setName(editingCategory?.name ?? "");
    setParentId(editingCategory?.parentId ?? "");
    setBudgetLimit(editingCategory?.budgetLimit != null ? String(editingCategory.budgetLimit) : "");
    setColor(editingCategory?.color ?? "#5A5A5A");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingCategory]);

  async function submit() {
    if (!name.trim()) return setErrors({ name: "Enter a category name." });
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        parentId: parentId || null,
        budgetLimit: parentId ? null : budgetLimit ? parseFloat(budgetLimit) : null,
        color,
      };
      if (isEdit && editingCategory) {
        await updateCategory.mutateAsync({ id: editingCategory.id, patch: payload });
        toast.show("Category updated.", { variant: "success" });
      } else {
        await createCategory.mutateAsync(payload);
        toast.show("Category added.", { variant: "success" });
      }
      onOpenChange(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit category" : "Add a category"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add category"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Category name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" />
        </FormField>
        <FormField label="Parent category" hint="Leave as top-level to make this a main category with its own budget.">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Top-level category —</option>
            {roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>
        {!parentId && (
          <FormField label="Monthly budget (optional)">
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
