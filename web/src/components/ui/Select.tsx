import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { Children, Fragment, isValidElement, useId, useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * A styled dropdown in place of the browser's <select>, so lists look and behave the same everywhere.
 * It keeps the native API on purpose: pass <option>/<optgroup> children and an `onChange` that reads
 * `e.target.value`, so call sites read exactly as they did with the native control.
 */

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
}
interface Group {
  label?: string;
  options: Opt[];
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function parseOption(node: ReactNode): Opt | null {
  if (!isValidElement(node) || node.type !== "option") return null;
  const p = node.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
  const label = textOf(p.children);
  return { value: p.value === undefined ? label : String(p.value), label, disabled: !!p.disabled };
}

/** Children as a flat list: arrays and fragments (<>…</>) are looked through, as the browser would. */
function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((c) => (isValidElement(c) && c.type === Fragment ? flatten((c.props as { children?: ReactNode }).children) : [c]));
}

function parseGroups(children: ReactNode): Group[] {
  const groups: Group[] = [];
  let loose: Group | null = null;
  for (const child of flatten(children)) {
    if (isValidElement(child) && child.type === "optgroup") {
      const p = child.props as { label?: string; children?: ReactNode };
      const options = flatten(p.children).map(parseOption).filter((o): o is Opt => !!o);
      groups.push({ label: p.label, options });
      loose = null;
      continue;
    }
    const opt = parseOption(child);
    if (!opt) continue;
    if (!loose) {
      loose = { options: [] };
      groups.push(loose);
    }
    loose.options.push(opt);
  }
  return groups;
}

export const fieldBase =
  "w-full rounded-control border border-line-strong bg-paper-raised px-3 py-2.5 text-body text-ink transition-colors focus:border-focus-ring focus:outline-none aria-[invalid=true]:border-danger";

const SEARCH_THRESHOLD = 12;

export interface SelectProps {
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** Shown when the current value matches no option (or an option with an empty value). */
  placeholder?: string;
  /** Drop the form-field look (for toolbar buttons that bring their own). */
  unstyled?: boolean;
  /** Content shown before the selected label, e.g. an icon and "Group:". */
  prefix?: ReactNode;
  children?: ReactNode;
}

export function Select({ value, onChange, id, name, disabled, className, placeholder = "Select…", unstyled, prefix, children, ...rest }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = value === undefined ? "" : String(value);

  const groups = useMemo(() => parseGroups(children), [children]);
  const all = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selected = all.find((o) => o.value === current);
  const searchable = all.length > SEARCH_THRESHOLD;

  const q = query.trim().toLowerCase();
  const shownGroups = q ? groups.map((g) => ({ ...g, options: g.options.filter((o) => o.label.toLowerCase().includes(q)) })).filter((g) => g.options.length) : groups;
  const shown = shownGroups.flatMap((g) => g.options);

  function openChange(next: boolean) {
    if (next) {
      setQuery("");
      const idx = all.findIndex((o) => o.value === current);
      setActive(idx < 0 ? Math.max(0, all.findIndex((o) => !o.disabled)) : idx);
    }
    setOpen(next);
  }
  function choose(opt: Opt) {
    if (opt.disabled) return;
    onChange?.({ target: { value: opt.value, name: name ?? "" }, currentTarget: { value: opt.value, name: name ?? "" } } as unknown as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  }
  function move(delta: number, from = active) {
    if (!shown.length) return;
    let i = from;
    for (let n = 0; n < shown.length; n++) {
      i = Math.min(shown.length - 1, Math.max(0, i + delta));
      if (!shown[i].disabled) break;
      if (i === 0 || i === shown.length - 1) break;
    }
    setActive(i);
    queueMicrotask(() => listRef.current?.querySelector(`[data-index="${i}"]`)?.scrollIntoView?.({ block: "nearest" }));
  }
  function onKeyDown(e: KeyboardEvent) {
    const step: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => move(1, -1),
      End: () => move(-1, shown.length),
    };
    if (step[e.key]) {
      e.preventDefault();
      step[e.key]();
    } else if (e.key === "Enter" || (e.key === " " && !searchable)) {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
      // Typeahead: jump to the next option starting with the typed letter.
      const ch = e.key.toLowerCase();
      const start = shown.findIndex((o, i) => i > active && o.label.toLowerCase().startsWith(ch));
      const hit = start >= 0 ? start : shown.findIndex((o) => o.label.toLowerCase().startsWith(ch));
      if (hit >= 0) setActive(hit);
    }
  }

  const indexOf = new Map(shown.map((o, i) => [o, i]));
  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          id={id}
          aria-label={rest["aria-label"]}
          aria-invalid={rest["aria-invalid"]}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          data-name={name}
          className={cn(!unstyled && fieldBase, "flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60", className)}
        >
          {prefix}
          <span className={cn("min-w-0 flex-1 truncate", (!selected || selected.value === "") && "text-ink-faint")}>{selected ? selected.label || placeholder : placeholder}</span>
          <ChevronDown size={15} aria-hidden className={cn("flex-none text-ink-faint transition-transform", open && "rotate-180")} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onKeyDown={onKeyDown}
          style={{ width: "max(var(--radix-popover-trigger-width), 11rem)" }}
          className="z-[90] overflow-hidden rounded-card border border-line-strong bg-paper-raised shadow-xl"
        >
          {searchable && (
            <label className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search size={14} aria-hidden className="flex-none text-ink-faint" />
              <input
                aria-label="Search options"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Search…"
                className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-ink-faint"
              />
            </label>
          )}
          <div ref={listRef} id={listId} role="listbox" aria-label={rest["aria-label"]} className="max-h-64 overflow-y-auto p-1">
            {shown.length === 0 && <div className="px-3 py-2 text-body text-ink-faint">No matches</div>}
            {shownGroups.map((g, gi) => (
              <div key={g.label ?? `g${gi}`} role={g.label ? "group" : undefined} aria-label={g.label}>
                {g.label && <div className="px-2.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-ink-faint">{g.label}</div>}
                {g.options.map((o) => {
                  const i = indexOf.get(o) ?? 0;
                  const isSel = o.value === current;
                  return (
                    <div
                      key={o.value}
                      role="option"
                      aria-selected={isSel}
                      aria-disabled={o.disabled || undefined}
                      data-value={o.value}
                      data-index={i}
                      onMouseMove={() => active !== i && !o.disabled && setActive(i)}
                      onClick={() => choose(o)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-2 rounded-control px-2.5 py-2 text-body",
                        i === active && "bg-paper-sunken",
                        isSel && "font-semibold",
                        o.value === "" && !isSel && "text-ink-faint",
                        o.disabled && "cursor-not-allowed opacity-40",
                      )}
                    >
                      <span className="min-w-0 truncate">{o.label || placeholder}</span>
                      {isSel && <Check size={14} aria-hidden className="flex-none text-brand" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
