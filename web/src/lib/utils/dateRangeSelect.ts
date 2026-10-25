import { toISODate } from "@/lib/utils/clock";

/** A range being picked: `end` is empty until the second date is chosen. */
export interface RangeDraft {
  start: string;
  end: string;
}

export const EMPTY_DRAFT: RangeDraft = { start: "", end: "" };

/**
 * One click on a day. The first click starts a range; the second finishes it, whichever side of the
 * start it falls on (an earlier date simply becomes the start). Clicking again after a finished range
 * begins a new one. Returns the new draft and whether it is complete.
 */
export function pickDay(draft: RangeDraft, iso: string): RangeDraft & { done: boolean } {
  if (!draft.start || draft.end) return { start: iso, end: "", done: false };
  if (iso < draft.start) return { start: iso, end: draft.start, done: true };
  return { start: draft.start, end: iso, done: true };
}

/** The range to highlight: the draft itself, or the start-to-hovered-day preview while the end is open. */
export function visibleRange(draft: RangeDraft, hover: string): { lo: string; hi: string } | null {
  if (!draft.start) return null;
  if (draft.end) return { lo: draft.start, hi: draft.end };
  if (!hover) return { lo: draft.start, hi: draft.start };
  return hover < draft.start ? { lo: hover, hi: draft.start } : { lo: draft.start, hi: hover };
}

export interface RangePreset {
  label: string;
  range: (todayIso: string) => { start: string; end: string };
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export const RANGE_PRESETS: RangePreset[] = [
  { label: "Last 7 days", range: (t) => ({ start: addDays(t, -6), end: t }) },
  { label: "Last 30 days", range: (t) => ({ start: addDays(t, -29), end: t }) },
  { label: "This month", range: (t) => ({ start: `${t.slice(0, 7)}-01`, end: t }) },
  {
    label: "Last month",
    range: (t) => {
      const first = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 2, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      return { start: toISODate(first), end: toISODate(last) };
    },
  },
];
