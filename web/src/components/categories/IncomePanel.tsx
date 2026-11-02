import { useState } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
import type { Category } from "@/types";
import { useCategories, useIncomeSources } from "@/hooks/queries";
import { useArchiveCategory } from "@/hooks/mutations";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Card } from "@/components/ui/primitives";
import { SkeletonList } from "@/components/ui/skeletons";
import { IncomeSourceChip } from "@/components/domain/chips";
import { CategoryForm } from "@/components/domain/CategoryForm";

/** Where money comes from: the sources you can file income under. */
export function IncomePanel() {
  const { data: sources = [], isLoading } = useIncomeSources();
  const { data: categories = [] } = useCategories();
  const archive = useArchiveCategory();
  const toast = useToast();
  const [form, setForm] = useState<{ edit: Category | null } | null>(null);
  const [archiving, setArchiving] = useState<Category | null>(null);

  async function confirmArchive() {
    if (!archiving) return;
    try {
      await archive.mutateAsync(archiving.id);
      toast.show("Income source archived.", { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  if (isLoading) return <div className="rounded-card border border-line bg-paper-raised p-5"><SkeletonList rows={4} withIcon={false} /></div>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-soft">Income sources group what you earn. They have no budgets.</p>
        <Button onClick={() => setForm({ edit: null })}><Plus size={15} /> Add income source</Button>
      </div>
      <Card className="flex flex-wrap gap-3">
        {sources.length === 0 && <span className="text-caption text-ink-faint">No income sources yet. Add one to start recording income.</span>}
        {sources.map((s) => (
          <span key={s.id} className="flex items-center gap-2 rounded-full border border-line bg-paper-sunken px-3 py-1.5 text-caption">
            <IncomeSourceChip source={s} size={22} /> {s.name}
            <button type="button" aria-label={`Edit ${s.name}`} onClick={() => setForm({ edit: s })} className="text-ink-faint hover:text-ink"><Pencil size={11} /></button>
            <button type="button" aria-label={`Archive ${s.name}`} onClick={() => setArchiving(s)} className="text-ink-faint hover:text-ink"><Archive size={11} /></button>
          </span>
        ))}
      </Card>
      <CategoryForm open={form !== null} onOpenChange={(o) => !o && setForm(null)} type="INCOME" categories={categories} editingCategory={form?.edit ?? null} />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title="Archive this income source?"
        message="Archived items stop showing up when adding transactions. Past transactions keep their source and history."
        confirmLabel="Archive"
        variant="primary"
        onConfirm={confirmArchive}
      />
    </div>
  );
}
