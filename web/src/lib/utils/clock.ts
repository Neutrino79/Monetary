/**
 * The app's idea of "today", always in the *user's* local calendar. Using
 * `toISOString()` would give the UTC date, which is the wrong day for several
 * hours every day in zones like IST -- so dates are built from local parts.
 */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function parseISODate(s: string): Date {
  return new Date(s + "T00:00:00");
}

/** 'YYYY-MM' for a date (the report month selector's value). */
export function toMonthKey(d: Date): string {
  return toISODate(d).slice(0, 7);
}
