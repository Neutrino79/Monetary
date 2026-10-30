import type { MonthSpan } from "@/types";
import { shiftMonth } from "@/lib/utils/dateRange";
import { toMonthKey } from "@/lib/utils/clock";

/** The one range every Reports tab follows. */
export type ReportRange = "3M" | "6M" | "12M" | "YTD";

export const REPORT_RANGES: { value: ReportRange; label: string }[] = [
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "12M", label: "12M" },
  { value: "YTD", label: "YTD" },
];

export const DEFAULT_RANGE: ReportRange = "12M";

export function parseRange(value: string | null | undefined): ReportRange {
  return REPORT_RANGES.some((r) => r.value === value) ? (value as ReportRange) : DEFAULT_RANGE;
}

/** How many months the range covers, counting the current one. Year to date is January up to now. */
export function rangeMonths(range: ReportRange, now = new Date()): number {
  if (range === "YTD") return now.getMonth() + 1;
  return Number(range.slice(0, -1));
}

/** What to compare the range against: the months just before it, or the same months a year earlier. */
export type CompareBasis = "previous" | "year";

export interface ComparePeriods {
  a: MonthSpan;
  b: MonthSpan;
}

/** The two periods the Compare tab starts with. A is the range; B is what it is compared against.
 *  Year to date has no "months just before it" that makes sense, so it always means the same months last year. */
export function comparePeriods(range: ReportRange, basis: CompareBasis, now = new Date()): ComparePeriods {
  const current = toMonthKey(now);
  const n = rangeMonths(range, now);
  const a = { from: shiftMonth(current, -(n - 1)), to: current };
  const yearBack = basis === "year" || range === "YTD";
  const b = yearBack ? { from: shiftMonth(a.from, -12), to: shiftMonth(a.to, -12) } : { from: shiftMonth(a.from, -n), to: shiftMonth(a.from, -1) };
  return { a, b };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 2026", "Aug – Oct 2026" or "Nov 2025 – Oct 2026". */
export function spanLabel(span: MonthSpan): string {
  const [fy, fm] = span.from.split("-").map(Number);
  const [ty, tm] = span.to.split("-").map(Number);
  if (span.from === span.to) return `${MONTHS[fm - 1]} ${fy}`;
  if (fy === ty) return `${MONTHS[fm - 1]} – ${MONTHS[tm - 1]} ${ty}`;
  return `${MONTHS[fm - 1]} ${fy} – ${MONTHS[tm - 1]} ${ty}`;
}

/** The whole-month number of a span, for validation (the API allows at most 36). */
export function spanMonths(span: MonthSpan): number {
  const [fy, fm] = span.from.split("-").map(Number);
  const [ty, tm] = span.to.split("-").map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm) + 1;
}

export function spanIsValid(span: MonthSpan): boolean {
  return /^\d{4}-\d{2}$/.test(span.from) && /^\d{4}-\d{2}$/.test(span.to) && spanMonths(span) >= 1 && spanMonths(span) <= 36;
}
