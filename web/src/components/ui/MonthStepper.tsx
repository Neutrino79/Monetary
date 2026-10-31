import { useState } from "react";
import { Popover } from "radix-ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toISODate } from "@/lib/utils/clock";
import { MONTH_SHORT, formatPickerMonth } from "@/lib/utils/calendar";
import { shiftMonth } from "@/lib/utils/dateRange";

/**
 * "‹ October 2026 ›": step by month with the arrows, or open the label to jump to any month of any year.
 * Months after `max` (default: the current month) can't be chosen.
 */
export function MonthStepper({ value, onChange, max, className, "aria-label": ariaLabel = "Month" }: {
  value: string; // 'YYYY-MM'
  onChange: (month: string) => void;
  max?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const limit = max ?? toISODate(new Date()).slice(0, 7);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const atMax = value >= limit;
  const maxYear = Number(limit.slice(0, 4));

  return (
    <div className={cn("inline-flex items-center rounded-control border border-line-strong bg-paper-raised", className)}>
      <button type="button" aria-label="Previous month" onClick={() => onChange(shiftMonth(value, -1))} className="rounded-l-[9px] px-2.5 py-2.5 text-ink-soft hover:bg-paper-sunken">
        <ChevronLeft size={15} />
      </button>
      <Popover.Root open={open} onOpenChange={(o) => { if (o) setYear(Number(value.slice(0, 4))); setOpen(o); }}>
        <Popover.Trigger asChild>
          <button type="button" aria-label={ariaLabel} className="min-w-36 border-x border-line px-3 py-2 text-center text-body font-semibold hover:bg-paper-sunken">
            {formatPickerMonth(value)}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="center" sideOffset={6} collisionPadding={12} className="z-[90] w-[16rem] rounded-card border border-line-strong bg-paper-raised p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="Previous year" onClick={() => setYear((y) => y - 1)} className="rounded-control p-1.5 hover:bg-paper-sunken">
                <ChevronLeft size={16} />
              </button>
              <div className="text-body font-semibold">{year}</div>
              <button type="button" aria-label="Next year" disabled={year >= maxYear} onClick={() => setYear((y) => y + 1)} className="rounded-control p-1.5 hover:bg-paper-sunken disabled:opacity-35">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_SHORT.map((name, i) => {
                const month = `${year}-${String(i + 1).padStart(2, "0")}`;
                const selected = month === value;
                return (
                  <button
                    key={month}
                    type="button"
                    aria-pressed={selected}
                    aria-label={formatPickerMonth(month)}
                    disabled={month > limit}
                    onClick={() => {
                      onChange(month);
                      setOpen(false);
                    }}
                    className={cn(
                      "rounded-control py-2 text-body hover:bg-paper-sunken disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent",
                      selected && "bg-ink font-semibold text-paper hover:bg-ink dark:bg-accent dark:text-accent-ink",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <button type="button" aria-label="Next month" disabled={atMax} onClick={() => onChange(shiftMonth(value, 1))} className="rounded-r-[9px] px-2.5 py-2.5 text-ink-soft hover:bg-paper-sunken disabled:opacity-35 disabled:hover:bg-transparent">
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
