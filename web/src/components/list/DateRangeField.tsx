import { ChevronLeft, ChevronRight } from "lucide-react";
import { today, toISODate } from "@/lib/utils/clock";
import { currentMonthRange, monthLabel, shiftMonth, type DateRange } from "@/lib/utils/dateRange";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/form";

const MODES: { value: DateRange["mode"]; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
  { value: "all", label: "All time" },
];

/** Month / custom range / all-time picker for the filters popover. Months can't go past the current one. */
export function DateRangeField({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const nowMonth = toISODate(new Date()).slice(0, 7);

  function setMode(mode: DateRange["mode"]) {
    if (mode === value.mode) return;
    if (mode === "month") onChange(currentMonthRange());
    else if (mode === "custom") onChange({ mode: "custom", from: "", to: "" });
    else onChange({ mode: "all" });
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Date filter" className="inline-flex self-start overflow-hidden rounded-[10px] border border-line-strong">
        {MODES.map((m, i) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={value.mode === m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "px-3 py-1.5 text-[13px] font-medium",
              i > 0 && "border-l border-line-strong",
              value.mode === m.value ? "bg-ink text-paper dark:bg-accent dark:text-accent-ink" : "bg-paper-raised text-ink hover:bg-paper-sunken",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {value.mode === "month" && (
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => onChange({ mode: "month", month: shiftMonth(value.month, -1) })} className="rounded-[8px] border border-line-strong p-2 hover:bg-paper-sunken">
            <ChevronLeft size={15} />
          </button>
          <Input type="month" aria-label="Month" max={nowMonth} value={value.month} onChange={(e) => e.target.value && onChange({ mode: "month", month: e.target.value })} className="flex-1" />
          <button type="button" aria-label="Next month" disabled={value.month >= nowMonth} onClick={() => onChange({ mode: "month", month: shiftMonth(value.month, 1) })} className="rounded-[8px] border border-line-strong p-2 hover:bg-paper-sunken disabled:opacity-40">
            <ChevronRight size={15} />
          </button>
          <span className="sr-only">{monthLabel(value.month)}</span>
        </div>
      )}

      {value.mode === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">
            From
            <Input type="date" max={value.to || today()} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">
            To
            <Input type="date" min={value.from || undefined} max={today()} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </label>
        </div>
      )}

      {value.mode === "all" && <p className="text-[12.5px] text-ink-soft">Showing every date.</p>}
    </div>
  );
}
