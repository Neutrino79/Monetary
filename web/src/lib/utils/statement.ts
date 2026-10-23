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
