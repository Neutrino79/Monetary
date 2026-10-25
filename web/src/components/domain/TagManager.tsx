import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { Tag } from "@/types";
import { useTags } from "@/hooks/queries";
import { useCreateTag, useDeleteTag, useRenameTag } from "@/hooks/mutations";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/primitives";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/Button";
import { MAX_TAG_LENGTH, normaliseTag } from "@/lib/utils/tags";
import { ConfirmDialog } from "@/components/ui/Dialog";

/** Set up your tags here: add, rename (onto an existing tag merges them) or delete. Each links to its transactions. */
export function TagManager() {
  const { data: tags = [], isLoading } = useTags();
  const create = useCreateTag();
  const rename = useRenameTag();
  const remove = useDeleteTag();
  const toast = useToast();
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [newName, setNewName] = useState("");
  const clean = normaliseTag(newName);
  const exists = tags.some((t) => t.name === clean);

  async function add() {
    if (!clean || exists) return;
    try {
      await create.mutateAsync(clean);
      setNewName("");
      toast.show(`Tag "${clean}" added.`, { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  async function saveRename() {
    if (!editing) return;
    try {
      await rename.mutateAsync({ id: editing.id, name: editing.name });
      toast.show("Tag renamed.", { variant: "success" });
      setEditing(null);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.show("Tag removed from your transactions.", { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  return (
    <Card>
      <div className="text-[14.5px] font-semibold">Your tags</div>
      <div className="mb-3 text-[12.5px] text-ink-faint">Add the labels you want (a trip, a project, a person), then pick them when you record a transaction. Renaming one onto another merges them.</div>
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Input aria-label="New tag" value={newName} maxLength={MAX_TAG_LENGTH + 5} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. goa trip" />
        <Button type="submit" disabled={!clean || exists || create.isPending}>Add tag</Button>
      </form>
      {exists && <p className="-mt-2 mb-3 text-[12px] text-ink-faint">That tag already exists.</p>}
      {isLoading ? null : tags.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-faint">No tags yet \u2014 add your first one above.</p>
      ) : (
        <ul aria-label="Tags">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 border-b border-dashed border-line py-2 last:border-b-0">
              {editing?.id === t.id ? (
                <>
                  <Input
                    aria-label={`New name for ${t.name}`}
                    value={editing.name}
                    onChange={(e) => setEditing({ id: t.id, name: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && saveRename()}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button type="button" aria-label="Save tag name" onClick={saveRename} className="rounded-[8px] p-1.5 text-accent hover:bg-paper-sunken"><Check size={15} /></button>
                    <button type="button" aria-label="Cancel renaming" onClick={() => setEditing(null)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken"><X size={15} /></button>
                  </div>
                </>
              ) : (
                <>
                  <Link to={`/transactions?tag=${encodeURIComponent(t.name)}`} className="min-w-0 truncate text-[13.3px] hover:underline">
                    {t.name} <span className="text-[12px] text-ink-faint">· {t.uses} transaction{t.uses === 1 ? "" : "s"}</span>
                  </Link>
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Rename ${t.name}`} onClick={() => setEditing({ id: t.id, name: t.name })} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink"><Pencil size={14} /></button>
                    <button type="button" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink"><Trash2 size={14} /></button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete the tag "${deleting?.name ?? ""}"?`}
        message="It is removed from every transaction that has it. The transactions themselves are not changed."
        confirmLabel="Delete tag"
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
