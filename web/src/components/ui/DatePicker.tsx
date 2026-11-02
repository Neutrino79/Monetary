import { useState } from "react";
import { Popover } from "radix-ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { today, toISODate } from "@/lib/utils/clock";
import { MONTH_NAMES, WEEKDAYS, formatPickerDate, monthGrid } from "@/lib/utils/calendar";

export interface DatePickerProps {
  /** 'YYYY-MM-DD', or '' for no date. */
  value: string;
  onChange: (value: string) => void;
  /** Inclusive limits, 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  /** Show a "Clear" action (for optional dates). */
  clearable?: boolean;
  className?: string;
}

/** A calendar popover in place of the browser's date input, so dates look and behave the same everywhere. */
export function DatePicker({ value, onChange, min, max, id, placeholder = "Pick a date", clearable = false, className, ...rest }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const todayIso = today();
  const seed = value || (max && max < todayIso ? max : todayIso);
  const [view, setView] = useState(() => ({ y: Number(seed.slice(0, 4)), m: Number(seed.slice(5, 7)) - 1 }));

  function openChange(next: boolean) {
    if (next) {
      const s = value || (max && max < todayIso ? max : todayIso);
      setView({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 });
    }
    setOpen(next);
  }
  function shift(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }
  const disabled = (iso: string) => (!!min && iso < min) || (!!max && iso > max);
  const monthStart = toISODate(new Date(view.y, view.m, 1));
  const monthEnd = toISODate(new Date(view.y, view.m + 1, 0));
  const canPrev = !min || monthStart > min;
  const canNext = !max || monthEnd < max;
  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          aria-label={rest["aria-label"]}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-control border border-line-strong bg-paper-raised px-3 py-2.5 text-left text-body transition-colors focus:border-focus-ring focus:outline-none",
            value ? "text-ink" : "text-ink-faint",
            className,
          )}
        >
          <span>{value ? formatPickerDate(value) : placeholder}</span>
          <CalendarDays size={15} aria-hidden className="flex-none text-ink-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className="z-[90] w-[17.5rem] rounded-card border border-line-strong bg-paper-raised p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => shift(-1)} className="rounded-control p-1.5 hover:bg-paper-sunken disabled:opacity-35">
              <ChevronLeft size={16} />
            </button>
            <div className="text-body font-semibold" aria-live="polite">
              {MONTH_NAMES[view.m]} {view.y}
            </div>
            <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => shift(1)} className="rounded-control p-1.5 hover:bg-paper-sunken disabled:opacity-35">
              <ChevronRight size={16} />
            </button>
          </div>
          <div role="grid" aria-label={`${MONTH_NAMES[view.m]} ${view.y}`}>
            <div role="row" className="grid grid-cols-7 text-center text-micro font-semibold text-ink-faint">
              {WEEKDAYS.map((w) => (
                <div key={w} role="columnheader" className="py-1">
                  {w}
                </div>
              ))}
            </div>
            {monthGrid(view.y, view.m).map((week, wi) => (
              <div key={wi} role="row" className="grid grid-cols-7">
                {week.map((iso, di) =>
                  iso ? (
                    <button
                      key={iso}
                      type="button"
                      role="gridcell"
                      aria-label={formatPickerDate(iso)}
                      aria-selected={iso === value}
                      disabled={disabled(iso)}
                      onClick={() => pick(iso)}
                      className={cn(
                        "m-0.5 h-8 rounded-control text-body hover:bg-paper-sunken disabled:cursor-not-allowed disabled:text-ink-faint disabled:opacity-40 disabled:hover:bg-transparent",
                        iso === todayIso && iso !== value && "font-semibold text-brand",
                        iso === value && "bg-btn font-semibold text-btn-ink hover:bg-btn",
                      )}
                    >
                      {Number(iso.slice(8))}
                    </button>
                  ) : (
                    <span key={`b${di}`} role="gridcell" aria-hidden className="m-0.5 h-8" />
                  ),
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button type="button" disabled={disabled(todayIso)} onClick={() => pick(todayIso)} className="rounded-control px-2 py-1 text-caption font-semibold text-brand hover:bg-paper-sunken disabled:opacity-40">
              Today
            </button>
            {clearable && value && (
              <button type="button" onClick={() => pick("")} className="rounded-control px-2 py-1 text-caption font-semibold text-ink-soft hover:bg-paper-sunken">
                Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
