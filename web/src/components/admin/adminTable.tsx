import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The admin lists use the ledger's own table look (see TransactionTable): a rounded card, a sunken header row,
 * 13.3px cells with 16px side padding and a footer with the count and the pager.
 */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-2xl border border-line bg-paper-raised", className)}>{children}</div>;
}

export function Th({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <th className={cn("h-[42px] whitespace-nowrap px-4 text-[12px] font-semibold text-ink-soft", align === "right" ? "text-right" : "text-left", className)}>
      {children}
    </th>
  );
}

export const tdClass = "px-4 py-3 align-middle";
export const trClass = "border-b border-line last:border-b-0 hover:bg-paper-sunken";

export function Table({ head, children, label }: { head: ReactNode; children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full min-w-176 border-collapse text-[13.3px]">
        <thead>
          <tr className="border-b border-line bg-paper-sunken">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** "9 of 40 accounts" with Previous / Page x of y / Next, as on the ledger lists. */
export function Pager({
  total, page, pageSize, noun, plural = `${noun}s`, onPage,
}: { total: number; page: number; pageSize: number; noun: string; plural?: string; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const btn = "rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken disabled:opacity-40";
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3">
      <span className="text-[12.5px] text-ink-soft">{total} {total === 1 ? noun : plural}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 0} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="text-[12.5px] text-ink-soft">Page {page + 1} of {pages}</span>
        <button type="button" className={btn} disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
