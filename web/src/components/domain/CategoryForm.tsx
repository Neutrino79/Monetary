import { useEffect, useState } from "react";
import type { Category, CategoryType } from "@/types";
import { useCreateCategory, useUpdateCategory } from "@/hooks/mutations";
import { ApiError } from "@/lib/api/errors";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { Input, Select, AmountInput, FormField } from "@/components/ui/form";
import { useFormErrors } from "@/lib/hooks/useFormErrors";

/** Add or edit a category, subcategory or income source in one small dialog. */
export function CategoryForm({
  open,
  onOpenChange,
  categories,
  type,
  editingCategory = null,
  defaultParentId = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: CategoryType;
  categories: Category[];
  editingCategory?: Category | null;
  /** A new subcategory starts under this category. */
  defaultParentId?: number | null;
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
  const { errors, setErrors } = useFormErrors({ name, budgetLimit, "*": [name, parentId, budgetLimit] });
  const [saving, setSaving] = useState(false);

  // a category that already has subcategories can't itself become a subcategory (one level only)
  const hasChildren = editingCategory ? categories.some((c) => c.parentId === editingCategory.id) : false;
  const roots = categories.filter((c) => !c.parentId && c.id !== editingCategory?.id);

  useEffect(() => {
    if (!open) return;
    setName(editingCategory?.name ?? "");
    setParentId(editingCategory ? editingCategory.parentId ?? null : defaultParentId);
    setBudgetLimit(editingCategory?.budgetLimit != null ? String(editingCategory.budgetLimit) : "");
    setColor(editingCategory?.color ?? "#5A5A5A");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingCategory, defaultParentId]);

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
