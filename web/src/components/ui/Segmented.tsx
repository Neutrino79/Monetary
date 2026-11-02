import { cn } from "@/lib/utils/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** A pill that toggles a filter on or off. Always at least 44px tall. */
export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 text-body font-semibold transition-colors",
        active ? "border-btn bg-btn text-btn-ink" : "border-line bg-paper-raised text-ink-soft hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

/** One choice out of a few, side by side in a single bar. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: SegmentOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <span role="group" aria-label={label} className="inline-flex overflow-hidden rounded-control border border-line-strong">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-9 px-3.5 text-body font-medium transition-colors pointer-coarse:min-h-11",
            i > 0 && "border-l border-line-strong",
            value === o.value ? "bg-btn text-btn-ink" : "bg-paper-raised text-ink hover:bg-paper-sunken",
          )}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
