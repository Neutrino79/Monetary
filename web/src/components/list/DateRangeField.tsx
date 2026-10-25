import { today } from "@/lib/utils/clock";
import { currentMonthRange, type DateRange } from "@/lib/utils/dateRange";
import { cn } from "@/lib/utils/cn";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { MonthStepper } from "@/components/ui/MonthStepper";

const MODES: { value: DateRange["mode"]; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
  { value: "all", label: "All time" },
];

/** Month / custom range / all-time picker for the filters popover. Months can't go past the current one. */
export function DateRangeField({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const nowMonth = today().slice(0, 7);

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
        <MonthStepper value={value.month} max={nowMonth} onChange={(month) => onChange({ mode: "month", month })} className="self-start" />
      )}

      {value.mode === "custom" && (
        <DateRangePicker aria-label="Date range" placeholder="Select dates" max={today()} from={value.from} to={value.to} onChange={({ from, to }) => onChange({ ...value, from, to })} />
      )}

      {value.mode === "all" && <p className="text-[12.5px] text-ink-soft">Showing every date.</p>}
    </div>
  );
}
