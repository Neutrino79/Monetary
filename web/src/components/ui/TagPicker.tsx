import { useState } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { MAX_TAGS, MAX_TAG_LENGTH, normaliseTag } from "@/lib/utils/tags";

/**
 * A multi-select dropdown over the tags you have set up: search, tick the ones you want, done. When the
 * search matches nothing it offers an explicit "Create tag" row (via `onCreate`), never a silent new tag.
 */
export function TagPicker({ value, onChange, options, onCreate, id, className }: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Every configured tag name. */
  options: string[];
  /** Creates a tag and resolves to its (normalised) name; omit to hide the create row. */
  onCreate?: (name: string) => Promise<string | null>;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const q = normaliseTag(query);
  const shown = options.filter((o) => !q || o.includes(q));
  const canCreate = !!onCreate && q.length > 0 && q.length <= MAX_TAG_LENGTH && !options.includes(q);
  const full = value.length >= MAX_TAGS;

  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((v) => v !== name) : full ? value : [...value, name]);

  async function create() {
    if (!onCreate || creating) return;
    setCreating(true);
    try {
      const name = await onCreate(q);
      if (name && !full) onChange(value.includes(name) ? value : [...value, name]);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          aria-label="Tags"
          className={cn("flex min-h-[2.6rem] w-full items-center justify-between gap-2 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-left text-[13.3px] focus:border-focus-ring focus:outline-none", className)}
        >
          <span className="flex min-w-0 flex-wrap gap-1.5">
            {value.length === 0 ? (
              <span className="text-ink-faint">Select tags</span>
            ) : (
              value.map((t) => (
                <span key={t} className="inline-flex items-center rounded-full bg-paper-sunken px-2.5 py-0.5 text-[12.5px]">{t}</span>
              ))
            )}
          </span>
          <ChevronDown size={15} aria-hidden className="flex-none text-ink-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className="z-[90] w-[var(--radix-popover-trigger-width)] min-w-64 rounded-[14px] border border-line-strong bg-paper-raised p-2 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (canCreate) void create(); else if (shown.length === 1) toggle(shown[0]); } }}
            placeholder="Search or create a tag"
            aria-label="Search tags"
            className="mb-1.5 w-full rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-[13px] focus:border-focus-ring focus:outline-none"
          />
          <div role="listbox" aria-multiselectable="true" aria-label="Tag options" className="max-h-56 overflow-y-auto">
            {shown.map((o) => {
              const on = value.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={!on && full}
                  onClick={() => toggle(o)}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] hover:bg-paper-sunken disabled:opacity-40"
                >
                  <span className={cn("flex h-4 w-4 flex-none items-center justify-center rounded border", on ? "border-ink bg-ink text-paper" : "border-line-strong")}>
                    {on && <Check size={11} />}
                  </span>
                  {o}
                </button>
              );
            })}
            {shown.length === 0 && !canCreate && (
              <div className="px-2 py-3 text-center text-[12.5px] text-ink-faint">{options.length === 0 ? "No tags yet" : "No tag matches"}</div>
            )}
            {canCreate && (
              <button type="button" onClick={create} disabled={creating} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] font-semibold text-accent hover:bg-paper-sunken">
                <Plus size={14} /> Create tag &ldquo;{q}&rdquo;
              </button>
            )}
          </div>
          {full && <div className="px-2 pt-1.5 text-[11.5px] text-ink-faint">Up to {MAX_TAGS} tags per transaction.</div>}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1.5 flex items-center gap-1 px-2 py-1 text-[12px] text-ink-soft hover:text-ink">
              <X size={12} /> Clear all
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
