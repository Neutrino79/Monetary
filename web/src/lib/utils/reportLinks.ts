import type { MonthSpan } from "@/types";

/** Where a figure on the Reports page leads: the matching transactions, already filtered. */
type Kind = "spending" | "income";
const page = (kind: Kind) => (kind === "spending" ? "/expenses" : "/income");

export const monthLink = (month: string, kind?: Kind) => `${kind ? page(kind) : "/transactions"}?month=${month}`;

export const categoryMonthLink = (kind: Kind, categoryId: number, month: string) => `${page(kind)}?category=${categoryId}&month=${month}`;

/** A category over a run of months. */
export const categorySpanLink = (kind: Kind, categoryId: number, span: MonthSpan) =>
  span.from === span.to ? categoryMonthLink(kind, categoryId, span.from) : `${page(kind)}?category=${categoryId}&from=${span.from}&to=${span.to}`;
