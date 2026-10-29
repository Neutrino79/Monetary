import type { Finding, MonthRef } from "@/types";
import { formatCurrency } from "@/lib/utils/format";

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const monthShort = (m: MonthRef) => MONTH_SHORT[m.month - 1]!;
export const monthLong = (m: MonthRef) => MONTH_LONG[m.month - 1]!;
export const monthKey = (m: MonthRef) => `${m.year}-${String(m.month).padStart(2, "0")}`;

/** "+₹680" / "−₹680"; a plain "—" for no change. */
export function signedMoney(n: number): string {
  if (Math.abs(n) < 0.5) return "—";
  return `${n > 0 ? "+" : "−"}${formatCurrency(Math.abs(n))}`;
}

/** "+27%" / "−4%"; "—" when there is nothing to compare with. */
export function signedPct(p: number | null | undefined, digits = 0): string {
  if (p === null || p === undefined) return "—";
  const rounded = Number(p.toFixed(digits));
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

/** A finding as a short headline and a supporting line. The backend sends the facts; the wording lives here. */
export function findingText(f: Finding): { title: string; body: string } {
  switch (f.code) {
    case "savings_rate": {
      const rate = Math.round(f.rate);
      const prev = f.previousRate === null ? null : Math.round(f.previousRate);
      const trend = prev === null || prev === rate ? "." : rate > prev ? `, up from ${prev}%.` : `, down from ${prev}%.`;
      return {
        title: `You keep ${rate}% of your income${trend}`,
        body: f.completeMonths > 0 ? `${f.goodMonths} of the last ${f.completeMonths} complete months were at or above 30%.` : "Not enough complete months yet to say how steady that is.",
      };
    }
    case "unusual_months": {
      const [first] = f.flagged;
      const title = f.flagged.length === 1 ? `${monthLong(first!)} was the one unusual month.` : `${f.flagged.length} months were unusual.`;
      const body = f.flagged
        .map((m) => (m.pct === null ? `${monthLong(m)} was off its usual` : `${monthLong(m)} ran ${Math.abs(Math.round(m.pct))}% ${m.pct >= 0 ? "above" : "below"} your normal spend`))
        .join("; ") + (f.flagged.length === 1 ? " and left your usual range." : ".");
      return { title, body };
    }
    case "main_income_cover":
      return {
        title: `${f.name} alone covers ${f.coverPct}% of average spending.`,
        body: f.coverPct >= 100 ? "Everything else you earn is savings, not living costs." : "Your other income makes up the rest.",
      };
    case "debt_change": {
      const pct = f.changePct === null ? "" : ` ${Math.abs(Math.round(f.changePct))}%`;
      return { title: `What you owe on cards and loans ${f.to < f.from ? "fell" : "rose"}${pct}.`, body: `${formatCurrency(f.from)} down to ${formatCurrency(f.to)} over the period.`.replace("down to", f.to < f.from ? "down to" : "up to") };
    }
  }
}
