import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Popover } from "radix-ui";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Layers, ListFilter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { today } from "@/lib/utils/clock";
import { DATE_PRESETS, activePreset, presetRange, rangeToFilters, shiftMonth, stripLabel, type DateRange } from "@/lib/utils/dateRange";
import { RangeCalendar } from "@/components/ui/RangeCalendar";

/**
 * The one control strip every list uses: search, date, filters and grouping in a single joined bar,
 * so a list's controls are always in the same place and never take more than one line.
 */

const segment =
  "flex items-center gap-2 px-3.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-paper-sunken focus-visible:bg-paper-sunken focus-visible:outline-none";

export function ControlStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="toolbar" aria-label="Search, date, filters and grouping" className={cn("inline-flex h-10 max-w-full items-stretch divide-x divide-line overflow-hidden rounded-[12px] border border-line-strong bg-paper-raised", className)}>
      {children}
    </div>
  );
}

/** A magnifier that opens into a text box (and stays open while it holds text). `alwaysOpen` skips the collapsed state. */
export function StripSearch({
  value,
  onChange,
  placeholder = "Search",
  alwaysOpen = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = alwaysOpen || open || value !== "";

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label="Search"
        onClick={() => {
          setOpen(true);
          // the box does not exist until this render finishes
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(segment, "w-11 justify-center px-0")}
      >
        <Search size={17} aria-hidden className="text-ink-soft" />
      </button>
    );
  }
  return (
    <label className="flex min-w-0 items-center gap-2 px-3 focus-within:bg-paper-sunken">
      <Search size={16} aria-hidden className="flex-none text-ink-soft" />
      <input
        ref={inputRef}
        type="search"
        aria-label="Search"
        autoFocus={open && !alwaysOpen}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => !value && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-40 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint sm:w-56 sm:flex-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange("")} className="flex-none text-ink-soft hover:text-ink">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

/** `‹ Oct 2026 ›` while on a month; the label opens presets and a calendar for any range. */
export function StripDate({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const nowMonth = today().slice(0, 7);
  const label = stripLabel(value);
  const active = activePreset(value);
  const effective = rangeToFilters(value);

  function apply(r: DateRange) {
    onChange(r);
    setOpen(false);
  }

  return (
    <div role="group" aria-label="Date range" className="flex min-w-0 flex-1 items-stretch sm:flex-none">
      {value.mode === "month" && (
        <button type="button" aria-label="Previous month" onClick={() => onChange({ mode: "month", month: shiftMonth(value.month, -1) })} className={cn(segment, "w-8 justify-center px-0")}>
          <ChevronLeft size={15} aria-hidden />
        </button>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className={cn(segment, "min-w-0 flex-1 justify-center font-semibold")}>
            <CalendarDays size={15} aria-hidden className="flex-none text-ink-soft" />
            <span className="truncate">{label}</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={8} collisionPadding={12} className="z-50 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[14px] border border-line-strong bg-paper-raised shadow-xl">
            <div className="flex flex-col sm:flex-row">
              <div className="flex flex-wrap gap-1 border-b border-line bg-paper p-2 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active === p.id}
                    onClick={() => apply(presetRange(p.id))}
                    className={cn("rounded-[8px] px-2.5 py-1.5 text-left text-[13px]", active === p.id ? "bg-ink font-semibold text-paper dark:bg-accent dark:text-accent-ink" : "hover:bg-paper-sunken")}
                  >
                    {p.label}
                  </button>
                ))}
                <div aria-pressed={active === "custom"} className={cn("rounded-[8px] px-2.5 py-1.5 text-[13px]", active === "custom" ? "bg-ink font-semibold text-paper dark:bg-accent dark:text-accent-ink" : "text-ink-soft")}>
                  Custom range
                </div>
              </div>
              <div className="w-full p-3 sm:w-[19rem]">
                <RangeCalendar from={effective.dateFrom ?? ""} to={effective.dateTo ?? ""} onPick={(r) => apply({ mode: "custom", from: r.from, to: r.to })} />
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {value.mode === "month" && (
        <button type="button" aria-label="Next month" disabled={value.month >= nowMonth} onClick={() => onChange({ mode: "month", month: shiftMonth(value.month, 1) })} className={cn(segment, "w-8 justify-center px-0 disabled:opacity-35 disabled:hover:bg-transparent")}>
          <ChevronRight size={15} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** The "Filters" button and its panel. `count` is how many filters are on (shown as a badge). */
export function StripFilters({
  count,
  resultCount,
  onReset,
  children,
}: {
  count: number;
  resultCount?: number;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label={count > 0 ? `Filters, ${count} on` : "Filters"} className={cn(segment, count > 0 && "text-accent")}>
          <ListFilter size={16} aria-hidden className={count > 0 ? "text-accent" : "text-ink-soft"} />
          <span className="hidden sm:inline">Filters</span>
          {count > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-ink">{count}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className="z-50 w-[min(21rem,calc(100vw-1.5rem))] rounded-[14px] border border-line-strong bg-paper-raised p-4 shadow-xl">
          <div className="flex flex-col gap-3.5">{children}</div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <button type="button" onClick={onReset} className="rounded-[8px] px-2 py-1 text-[13px] font-semibold text-ink-soft hover:bg-paper-sunken">
              Reset
            </button>
            <Popover.Close className="rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-paper dark:bg-accent dark:text-accent-ink">
              {resultCount == null ? "Done" : `Show ${resultCount} result${resultCount === 1 ? "" : "s"}`}
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface GroupOption {
  value: string;
  label: string;
}

/** "Group Day": a menu of ways to section the table. */
export function StripGroup({ value, options, onChange }: { value: string; options: GroupOption[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`Group by: ${current?.label ?? "None"}`} className={cn(segment, "bg-paper-sunken")}>
          <Layers size={16} aria-hidden className="text-ink-soft" />
          <span className="hidden text-ink-soft sm:inline">Group</span>
          <span className="font-semibold">{current?.label}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className="z-50 w-56 rounded-[14px] border border-line-strong bg-paper-raised p-2 shadow-xl">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Group transactions by</div>
          <div role="menu" aria-label="Group by">
            {options.map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn("flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[13.5px]", on ? "bg-accent-soft font-semibold text-accent" : "hover:bg-paper-sunken")}
                >
                  {o.label}
                  {on && <Check size={15} aria-hidden />}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A labelled block inside the filters panel. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      {children}
    </div>
  );
}
