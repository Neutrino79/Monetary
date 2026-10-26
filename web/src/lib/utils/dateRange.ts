import { toISODate } from "@/lib/utils/clock";

/**
 * The date filter of a list: one calendar month (the default is the current month), a custom
 * from/to range, or "all" (no date filter). Pure helpers -- the server does the filtering.
 */
export type DateRange =
  | { mode: "month"; month: string } // 'YYYY-MM'
  | { mode: "custom"; from: string; to: string } // 'YYYY-MM-DD', either may be empty
  | { mode: "all" };

export function currentMonthRange(now = new Date()): DateRange {
  return { mode: "month", month: toISODate(now).slice(0, 7) };
}

export function isDefaultRange(r: DateRange, now = new Date()): boolean {
  return r.mode === "month" && r.month === (currentMonthRange(now) as { month: string }).month;
}

/** Shift a 'YYYY-MM' month by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The `dateFrom`/`dateTo` query values. A month ends on its last day, or today for the current month. */
export function rangeToFilters(r: DateRange, now = new Date()): { dateFrom?: string; dateTo?: string } {
  if (r.mode === "all") return {};
  if (r.mode === "custom") return { dateFrom: r.from || undefined, dateTo: r.to || undefined };
  const [y, m] = r.month.split("-").map(Number);
  const last = toISODate(new Date(y, m, 0));
  const today = toISODate(now);
  return { dateFrom: `${r.month}-01`, dateTo: last > today ? today : last };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Text for the date chip; empty for "all" (nothing is filtered). */
export function rangeLabel(r: DateRange): string {
  if (r.mode === "all") return "";
  if (r.mode === "month") return monthLabel(r.month);
  if (r.from && r.to) return `${shortDate(r.from)} – ${shortDate(r.to)}`;
  if (r.from) return `From ${shortDate(r.from)}`;
  if (r.to) return `Until ${shortDate(r.to)}`;
  return "";
}

export type DatePresetId = "this-month" | "last-month" | "7d" | "30d" | "year" | "all";

export const DATE_PRESETS: { id: DatePresetId; label: string }[] = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

/** The date filter a preset stands for. */
export function presetRange(id: DatePresetId, now = new Date()): DateRange {
  const t = toISODate(now);
  const back = (days: number) => toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  switch (id) {
    case "this-month":
      return currentMonthRange(now);
    case "last-month":
      return { mode: "month", month: shiftMonth(t.slice(0, 7), -1) };
    case "7d":
      return { mode: "custom", from: back(6), to: t };
    case "30d":
      return { mode: "custom", from: back(29), to: t };
    case "year":
      return { mode: "custom", from: `${now.getFullYear()}-01-01`, to: t };
    case "all":
      return { mode: "all" };
  }
}

/** Which preset the current filter is, or "custom" when it is none of them. */
export function activePreset(r: DateRange, now = new Date()): DatePresetId | "custom" {
  for (const p of DATE_PRESETS) {
    const q = presetRange(p.id, now);
    if (q.mode !== r.mode) continue;
    if (q.mode === "all" || (q.mode === "month" && r.mode === "month" && q.month === r.month) || (q.mode === "custom" && r.mode === "custom" && q.from === r.from && q.to === r.to)) {
      return p.id;
    }
  }
  return "custom";
}

/** Short text for the date segment: "Oct 2026", "5 Mar – 9 Mar 2026", "All time". */
export function stripLabel(r: DateRange): string {
  if (r.mode === "all") return "All time";
  return rangeLabel(r) || "All time";
}
