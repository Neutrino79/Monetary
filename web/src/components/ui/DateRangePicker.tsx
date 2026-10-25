import { useState } from "react";
import { Popover } from "radix-ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { today, toISODate } from "@/lib/utils/clock";
import { MONTH_NAMES, WEEKDAYS, formatPickerDate, monthGrid } from "@/lib/utils/calendar";
import { EMPTY_DRAFT, RANGE_PRESETS, pickDay, visibleRange, type RangeDraft } from "@/lib/utils/dateRangeSelect";

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

/**
 * One calendar for a whole date range: click the first day, then the last, in the same popup. The days
 * in between are highlighted (and previewed as you move over them), so the range is always visible.
 */
export function DateRangePicker({ from, to, onChange, max, id, placeholder = "Select dates", className, ...rest }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RangeDraft>(EMPTY_DRAFT);
  const [hover, setHover] = useState("");
  const todayIso = today();
  const limit = max ?? todayIso;
  const seed = to || from || limit;
  const [view, setView] = useState(() => ({ y: Number(seed.slice(0, 4)), m: Number(seed.slice(5, 7)) - 1 }));

  function openChange(next: boolean) {
    if (next) {
      setDraft({ start: from, end: to });
      setHover("");
      const s = to || from || limit;
      setView({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 });
    }
    setOpen(next);
  }
  function shift(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }
  function commit(start: string, end: string) {
    onChange({ from: start, to: end });
    setOpen(false);
  }
  function click(iso: string) {
    const next = pickDay(draft, iso);
    if (next.done) return commit(next.start, next.end);
    setDraft({ start: next.start, end: "" });
    setHover("");
  }

  const disabled = (iso: string) => iso > limit;
  const monthEnd = toISODate(new Date(view.y, view.m + 1, 0));
  const canNext = monthEnd < limit;
  const shownRange = visibleRange(draft, hover);
  const hasValue = !!from && !!to;
  const label = hasValue ? (from === to ? formatPickerDate(from) : `${formatPickerDate(from)} – ${formatPickerDate(to)}`) : placeholder;
  const hint = !draft.start ? "Choose the first day" : !draft.end ? "Now choose the last day" : "";

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
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
          <div className="mb-1 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-[8px] p-1.5 hover:bg-paper-sunken">
              <ChevronLeft size={16} />
            </button>
            <div className="text-[13.5px] font-semibold" aria-live="polite">
              {MONTH_NAMES[view.m]} {view.y}
            </div>
            <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => shift(1)} className="rounded-[8px] p-1.5 hover:bg-paper-sunken disabled:opacity-35">
              <ChevronRight size={16} />
            </button>
          </div>
          <div role="grid" aria-label={`${MONTH_NAMES[view.m]} ${view.y}`} onMouseLeave={() => setHover("")}>
            <div role="row" className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-faint">
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
                  const isEdge = !!shownRange && (iso === shownRange.lo || iso === shownRange.hi);
                  const inside = !!shownRange && iso > shownRange.lo && iso < shownRange.hi;
                  const single = !!shownRange && shownRange.lo === shownRange.hi;
                  const isStart = !!shownRange && iso === shownRange.lo;
                  const isEnd = !!shownRange && iso === shownRange.hi;
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
                        disabled={disabled(iso)}
                        onClick={() => click(iso)}
                        onMouseEnter={() => setHover(iso)}
                        onFocus={() => setHover(iso)}
                        className={cn(
                          "absolute inset-y-0.5 inset-x-0.5 rounded-[8px] text-[13px] hover:bg-paper-sunken disabled:cursor-not-allowed disabled:text-ink-faint disabled:opacity-40 disabled:hover:bg-transparent",
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
            <span className="text-[12px] text-ink-soft" aria-live="polite">
              {hint}
            </span>
            {(from || to || draft.start) && (
              <button
                type="button"
                onClick={() => commit("", "")}
                className="rounded-[8px] px-2 py-1 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken"
              >
                Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
