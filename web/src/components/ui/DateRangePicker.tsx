import { useState } from "react";
import { Popover } from "radix-ui";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { today } from "@/lib/utils/clock";
import { formatPickerDate } from "@/lib/utils/calendar";
import { RANGE_PRESETS } from "@/lib/utils/dateRangeSelect";
import { RangeCalendar } from "@/components/ui/RangeCalendar";

export interface DateRangePickerProps {
  /** 'YYYY-MM-DD' each, or '' when no range is set. */
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Latest selectable date (inclusive). */
  max?: string;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  className?: string;
}

/** One trigger and one calendar for a whole date range: click the first day, then the last, in the same popup. */
export function DateRangePicker({ from, to, onChange, max, id, placeholder = "Select dates", className, ...rest }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const limit = max ?? today();
  function commit(start: string, end: string) {
    onChange({ from: start, to: end });
    setOpen(false);
  }
  const hasValue = !!from && !!to;
  const label = hasValue ? (from === to ? formatPickerDate(from) : `${formatPickerDate(from)} – ${formatPickerDate(to)}`) : placeholder;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          aria-label={rest["aria-label"]}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2.5 text-left text-[13.3px] transition-colors focus:border-focus-ring focus:outline-none",
            hasValue ? "text-ink" : "text-ink-faint",
            className,
          )}
        >
          <span className="min-w-0 truncate">{label}</span>
          <CalendarDays size={15} aria-hidden className="flex-none text-ink-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className="z-[90] w-[18.5rem] max-w-[calc(100vw-1.5rem)] rounded-[14px] border border-line-strong bg-paper-raised p-3 shadow-xl">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  const r = p.range(limit);
                  commit(r.start, r.end);
                }}
                className="rounded-full border border-line-strong px-2.5 py-1 text-[12px] font-medium text-ink-soft hover:bg-paper-sunken hover:text-ink"
              >
                {p.label}
              </button>
            ))}
          </div>
          <RangeCalendar
            from={from}
            to={to}
            max={max}
            onPick={(r) => commit(r.from, r.to)}
            footerRight={
              (from || to) && (
                <button type="button" onClick={() => commit("", "")} className="rounded-[8px] px-2 py-1 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken">
                  Clear
                </button>
              )
            }
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
