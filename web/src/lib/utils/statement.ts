import type { StatementRow } from "@/types";
import { formatCurrency } from "@/lib/utils/format";

/** What a statement line means, in words, from the friend's point of view. */
export function describeStatementRow(row: StatementRow, friendName: string): string {
  switch (row.entryType) {
    case "SPLIT":
      return `You paid; ${friendName}'s share`;
    case "FRONTED":
      return `${friendName} paid for you`;
    case "SETTLEMENT":
      return row.delta < 0 ? `${friendName} paid you back` : `You paid ${friendName} back`;
    default:
      return "Balance change";
  }
}

export function balanceSentence(balance: number, friendName: string): string {
  if (balance === 0) return "All settled up";
  return balance > 0 ? `${friendName} owes you ${formatCurrency(balance, true)}` : `You owe ${friendName} ${formatCurrency(-balance, true)}`;
}

/** Statement lines grouped by calendar day, keeping the order they came in (newest first stays newest first). */
export function groupByDay<T extends { date: string }>(rows: T[]): { date: string; rows: T[] }[] {
  const groups: { date: string; rows: T[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else groups.push({ date: row.date, rows: [row] });
  }
  return groups;
}

/**
 * What each side put in: lines that raised the balance (you paid, their share) against lines that lowered it
 * (they paid for you, or a settlement). Display totals of the statement as the API sent it, not ledger math.
 */
export function statementTotals(rows: StatementRow[]): { youPaid: number; theyPaid: number } {
  let youPaid = 0;
  let theyPaid = 0;
  for (const r of rows) {
    if (r.entryType === "SETTLEMENT") continue;
    if (r.delta > 0) youPaid += r.delta;
    else theyPaid += -r.delta;
  }
  return { youPaid, theyPaid };
}

/** "October 2026" for an ISO date, in the viewer's own calendar terms. */
export function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Statement lines grouped by calendar month (newest first stays newest first), each with the net change over the month. */
export function groupByMonth<T extends { date: string; delta: number }>(rows: T[]): { key: string; label: string; net: number; rows: T[] }[] {
  const groups: { key: string; label: string; net: number; rows: T[] }[] = [];
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
      last.net += row.delta;
    } else groups.push({ key, label: monthLabel(row.date), net: row.delta, rows: [row] });
  }
  return groups;
}
