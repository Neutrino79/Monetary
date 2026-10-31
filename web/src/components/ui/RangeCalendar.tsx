import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { today, toISODate } from "@/lib/utils/clock";
import { MONTH_NAMES, WEEKDAYS, formatPickerDate, monthGrid } from "@/lib/utils/calendar";
import { EMPTY_DRAFT, pickDay, visibleRange, type RangeDraft } from "@/lib/utils/dateRangeSelect";

/**
 * A month calendar for choosing a date range: the first click starts it, the second finishes it (the
 * days in between are highlighted, and previewed as you move over them). `onPick` fires once both
 * ends are chosen. It has no popover of its own, so a popover can hold it next to other controls.
 */
export function RangeCalendar({
  from,
  to,
  max,
  onPick,
  footerRight,
}: {
  /** The range to show when it opens, 'YYYY-MM-DD' each, or '' for none. */
  from: string;
  to: string;
  /** Latest selectable day (inclusive); today by default. */
  max?: string;
  onPick: (range: { from: string; to: string }) => void;
  footerRight?: ReactNode;
}) {
  const todayIso = today();
  const limit = max ?? todayIso;
  const seed = to || from || limit;
  const [view, setView] = useState(() => ({ y: Number(seed.slice(0, 4)), m: Number(seed.slice(5, 7)) - 1 }));
  const [draft, setDraft] = useState<RangeDraft>(() => (from && to ? { start: from, end: to } : EMPTY_DRAFT));
  const [hover, setHover] = useState("");

  function shift(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }
  function click(iso: string) {
    const next = pickDay(draft, iso);
    if (next.done) return onPick({ from: next.start, to: next.end });
    setDraft({ start: next.start, end: "" });
    setHover("");
  }

  const monthEnd = toISODate(new Date(view.y, view.m + 1, 0));
  const canNext = monthEnd < limit;
  const shown = visibleRange(draft, hover);
  const hint = !draft.start ? "Choose the first day" : !draft.end ? "Now choose the last day" : "";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-control p-1.5 hover:bg-paper-sunken">
          <ChevronLeft size={16} />
        </button>
        <div className="text-body font-semibold" aria-live="polite">
          {MONTH_NAMES[view.m]} {view.y}
        </div>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => shift(1)} className="rounded-control p-1.5 hover:bg-paper-sunken disabled:opacity-35">
          <ChevronRight size={16} />
        </button>
      </div>
      <div role="grid" aria-label={`${MONTH_NAMES[view.m]} ${view.y}`} onMouseLeave={() => setHover("")}>
        <div role="row" className="grid grid-cols-7 text-center text-micro font-semibold text-ink-faint">
          {WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" className="py-1">
              {w}
            </div>
          ))}
        </div>
        {monthGrid(view.y, view.m).map((week, wi) => (
          <div key={wi} role="row" className="grid grid-cols-7">
            {week.map((iso, di) => {
              if (!iso) return <span key={`b${di}`} role="gridcell" aria-hidden className="h-9" />;
              const isEdge = !!shown && (iso === shown.lo || iso === shown.hi);
              const inside = !!shown && iso > shown.lo && iso < shown.hi;
              const single = !!shown && shown.lo === shown.hi;
              const isStart = !!shown && iso === shown.lo;
              const isEnd = !!shown && iso === shown.hi;
              return (
                // The band behind the day runs edge to edge, so a range reads as one continuous strip.
                <div
                  key={iso}
                  className={cn(
                    "relative h-9",
                    inside && "bg-accent/15",
                    !single && isStart && "rounded-l-[8px] bg-accent/15",
                    !single && isEnd && "rounded-r-[8px] bg-accent/15",
                    di === 0 && inside && "rounded-l-[8px]",
                    di === 6 && inside && "rounded-r-[8px]",
                  )}
                >
                  <button
                    type="button"
                    role="gridcell"
                    aria-label={formatPickerDate(iso)}
                    aria-selected={isEdge || inside}
                    data-range={isEdge ? "edge" : inside ? "inside" : undefined}
                    disabled={iso > limit}
                    onClick={() => click(iso)}
                    onMouseEnter={() => setHover(iso)}
                    onFocus={() => setHover(iso)}
                    className={cn(
                      "absolute inset-x-0.5 inset-y-0.5 rounded-control text-body hover:bg-paper-sunken disabled:cursor-not-allowed disabled:text-ink-faint disabled:opacity-40 disabled:hover:bg-transparent",
                      iso === todayIso && !isEdge && "font-semibold text-accent",
                      inside && "hover:bg-accent/25",
                      isEdge && "bg-ink font-semibold text-paper hover:bg-ink dark:bg-accent dark:text-accent-ink",
                    )}
                  >
                    {Number(iso.slice(8))}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex min-h-8 items-center justify-between border-t border-line pt-2">
        <span className="text-caption text-ink-soft" aria-live="polite">
          {hint}
        </span>
        {footerRight}
      </div>
    </div>
  );
}
