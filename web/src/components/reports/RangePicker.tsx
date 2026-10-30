import { REPORT_RANGES, type ReportRange } from "@/lib/utils/reportRange";
import { cn } from "@/lib/utils/cn";

/** The one range every tab follows. */
export function RangePicker({ value, onChange }: { value: ReportRange; onChange: (r: ReportRange) => void }) {
  return (
    <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-[10px] border border-line bg-paper-raised p-0.5">
      {REPORT_RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          role="radio"
          aria-checked={value === r.value}
          onClick={() => onChange(r.value)}
          className={cn(
            "rounded-[8px] px-3.5 py-1.5 text-[12.8px] font-semibold transition-colors",
            value === r.value ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
