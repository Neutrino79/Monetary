import type { ReactNode } from "react";
import { Popover } from "radix-ui";
import { Layers, ListFilter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Select } from "@/components/ui/Select";

/** The one search/filter/group/sort toolbar every list page uses (design direction "A"). */

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}

export interface ToolbarChip {
  key: string;
  label: string;
  onRemove?: () => void;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex h-10 min-w-0 flex-1 basis-72 items-center gap-2.5 rounded-[10px] border border-line-strong bg-paper-raised px-3.5 focus-within:border-focus-ring", className)}>
      <Search size={16} className="flex-none text-ink-soft" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="text-ink-soft hover:text-ink">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

const buttonLook =
  "inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-paper-raised px-3.5 text-[13.5px] font-medium text-ink hover:bg-paper-sunken";

/** A dropdown dressed as a toolbar button ("Group: Date"), built on the app's custom Select. */
export function ToolbarSelect<V extends string>({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon?: ReactNode;
  value: V;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
}) {
  return (
    <Select
      unstyled
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as V)}
      className={cn(buttonLook, "justify-start font-semibold focus-visible:border-focus-ring")}
      prefix={
        <>
          {icon}
          <span className="font-medium text-ink-soft">{label}:</span>
        </>
      }
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function ListToolbar({
  search,
  filters,
  group,
  sort,
  chips = [],
  onResetAll,
  resetLabel = "Reset all",
}: {
  search: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** The popover's fields. `count` = how many differ from the defaults (shown on the button). */
  filters?: { count: number; children: ReactNode; onReset: () => void };
  group?: { value: string; options: SelectOption[]; onChange: (v: string) => void };
  sort?: { value: string; options: SelectOption[]; onChange: (v: string) => void };
  chips?: ToolbarChip[];
  onResetAll?: () => void;
  resetLabel?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBar value={search.value} onChange={search.onChange} placeholder={search.placeholder} />
        {filters && (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className={cn(buttonLook, filters.count > 0 && "border-ink")}>
                <ListFilter size={15} aria-hidden /> Filters
                {filters.count > 0 && (
                  <span className="rounded-full bg-ink px-1.5 text-[11.5px] text-paper dark:bg-accent dark:text-accent-ink">{filters.count}</span>
                )}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={8}
                collisionPadding={12}
                className="z-50 w-[min(26rem,calc(100vw-1.5rem))] rounded-[14px] border border-line-strong bg-paper-raised p-4 shadow-xl"
              >
                <div className="mb-3 text-[14px] font-semibold">Filters</div>
                <div className="flex flex-col gap-4">{filters.children}</div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <button type="button" onClick={filters.onReset} className="rounded-[8px] px-2 py-1 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken">
                    Reset filters
                  </button>
                  <Popover.Close className="rounded-[10px] bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-paper dark:bg-accent dark:text-accent-ink">
                    Done
                  </Popover.Close>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        {group && <ToolbarSelect label="Group" icon={<Layers size={15} aria-hidden />} value={group.value} options={group.options} onChange={group.onChange} />}
        {sort && <ToolbarSelect label="Sort" value={sort.value} options={sort.options} onChange={sort.onChange} />}
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-ink-soft">Active:</span>
          {chips.map((c) => (
            <span key={c.key} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-paper-sunken pl-2.5 pr-1.5 text-[12.5px]">
              {c.label}
              {c.onRemove && (
                <button type="button" aria-label={`Remove filter ${c.label}`} onClick={c.onRemove} className="rounded-full p-0.5 text-ink-soft hover:bg-line hover:text-ink">
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
          {onResetAll && (
            <button type="button" onClick={onResetAll} className="px-1.5 text-[12.5px] underline text-ink-soft hover:text-ink">
              {resetLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A labelled block inside the filters popover. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      {children}
    </div>
  );
}
