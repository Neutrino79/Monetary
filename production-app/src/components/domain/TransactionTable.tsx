import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { Transaction, TransactionType } from "@/types";
import { useAccounts, useCategories, useFriends } from "@/hooks/queries";
import * as calc from "@/lib/db/store";
import { formatDate, clamp } from "@/lib/utils/format";
import { TXN_TYPE_META } from "@/lib/utils/entityVisuals";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/primitives";
import { TxnBadge, TxnAmount } from "./chips";
import { TransactionForm } from "./TransactionForm";
import { TxnDetailDrawer } from "./TxnDetailDrawer";

interface FilterState {
  search: string;
  from: string;
  to: string;
  accountId: string;
  categoryId: string;
  type: string;
  friendId: string;
}
const emptyFilters: FilterState = { search: "", from: "", to: "", accountId: "", categoryId: "", type: "", friendId: "" };

type SortKey = "date" | "description" | "amount";

export function TransactionTable({
  allowedTypes,
  title,
  description,
  showTypeFilter = true,
  showCategoryFilter = true,
  showAccountFilter = true,
  showFriendFilter = false,
  addType = "expense",
  emptyTitle = "No transactions found",
  emptyDescription = "Try adjusting your filters, or add a new transaction.",
  pageSize = 12,
}: {
  allowedTypes: TransactionType[];
  title: string;
  description: string;
  showTypeFilter?: boolean;
  showCategoryFilter?: boolean;
  showAccountFilter?: boolean;
  showFriendFilter?: boolean;
  addType?: TransactionType;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: friends = [] } = useFriends();

  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  function matchesCategory(t: Transaction, catId: string): boolean {
    if (!catId) return true;
    if (t.categoryId === catId) return true;
    return calc.categoryChildren(catId).some((k) => k.id === t.categoryId);
  }

  const filteredSorted = useMemo(() => {
    let rows = calc.activeTxns((t) => allowedTypes.includes(t.type));
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((t) => (t.description + " " + (t.memo ?? "")).toLowerCase().includes(q));
    }
    if (filters.from) rows = rows.filter((t) => t.date >= filters.from);
    if (filters.to) rows = rows.filter((t) => t.date <= filters.to);
    if (filters.accountId) rows = rows.filter((t) => t.accountId === filters.accountId || t.toAccountId === filters.accountId);
    if (filters.categoryId) rows = rows.filter((t) => matchesCategory(t, filters.categoryId));
    if (filters.type) rows = rows.filter((t) => t.type === filters.type);
    if (filters.friendId) rows = rows.filter((t) => t.friendId === filters.friendId || (t.splits ?? []).some((s) => s.friendId === filters.friendId));

    rows = [...rows].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "amount") {
        av = a.yourShare ?? a.amount;
        bv = b.yourShare ?? b.amount;
      } else if (sortKey === "description") {
        av = a.description;
        bv = b.description;
      } else {
        av = a.date;
        bv = b.date;
      }
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sortKey, sortDir, allowedTypes]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const currentPage = clamp(page, 1, totalPages);
  const pageRows = filteredSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const activeChips: Array<[keyof FilterState, string]> = [];
  if (filters.search) activeChips.push(["search", `"${filters.search}"`]);
  if (filters.from) activeChips.push(["from", `From ${formatDate(filters.from)}`]);
  if (filters.to) activeChips.push(["to", `To ${formatDate(filters.to)}`]);
  if (filters.accountId) activeChips.push(["accountId", accounts.find((a) => a.id === filters.accountId)?.name ?? ""]);
  if (filters.categoryId) activeChips.push(["categoryId", calc.getCategory(filters.categoryId)?.name ?? ""]);
  if (filters.type) activeChips.push(["type", TXN_TYPE_META[filters.type as TransactionType].label]);
  if (filters.friendId) activeChips.push(["friendId", friends.find((f) => f.id === filters.friendId)?.name ?? ""]);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 opacity-60">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  }

  function rowSubtext(t: Transaction): string {
    if (t.type === "transfer") return `${calc.getAccount(t.accountId)?.name} \u2192 ${calc.getAccount(t.toAccountId)?.name}`;
    if (t.type === "settlement") return friends.find((f) => f.id === t.friendId)?.name ?? "";
    if (t.categoryId) return calc.getCategory(t.categoryId)?.name ?? "\u2014";
    return calc.getAccount(t.accountId)?.name ?? "";
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">{description}</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add {title === "Transactions" ? "transaction" : addType}
        </Button>
      </div>

      <div className="rounded-2xl border border-line bg-paper-raised p-5">
        <div className="mb-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 basis-60 items-center gap-2 rounded-[10px] bg-paper-sunken px-3 py-2">
              <Search size={15} className="text-ink-faint" />
              <input
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                placeholder="Search description or memo…"
                className="flex-1 bg-transparent text-[13.3px] outline-none"
              />
            </div>
            {showTypeFilter && (
              <select value={filters.type} onChange={(e) => updateFilter("type", e.target.value)} className="min-w-32.5 max-w-60 flex-1 basis-37.5 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.3px]">
                <option value="">All types</option>
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>
                    {TXN_TYPE_META[t].label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={filters.from} max={calc.MOCK_TODAY} onChange={(e) => updateFilter("from", e.target.value)} title="From date" className="min-w-30 max-w-42.5 flex-1 basis-32.5 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.3px]" />
            <input type="date" value={filters.to} max={calc.MOCK_TODAY} onChange={(e) => updateFilter("to", e.target.value)} title="To date" className="min-w-30 max-w-42.5 flex-1 basis-32.5 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.3px]" />
            {showAccountFilter && (
              <select value={filters.accountId} onChange={(e) => updateFilter("accountId", e.target.value)} className="min-w-32.5 max-w-60 flex-1 basis-37.5 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.3px]">
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            {showCategoryFilter && (
              <select value={filters.categoryId} onChange={(e) => updateFilter("categoryId", e.target.value)} className="min-w-32.5 max-w-60 flex-1 basis-37.5 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.3px]">
                <option value="">All categories</option>
                {categories
                  .filter((c) => !c.parentId)
                  .map((root) => (
                    <optgroup key={root.id} label={root.name}>
                      <option value={root.id}>{root.name} (all)</option>
                      {calc.categoryChildren(root.id).map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            )}
            {showFriendFilter && (
              <select value={filters.friendId} onChange={(e) => updateFilter("friendId", e.target.value)} className="min-w-32.5 max-w-60 flex-1 basis-37.5 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.3px]">
                <option value="">All friends</option>
                {friends.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            <button onClick={() => setFilters(emptyFilters)} className="ml-auto rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken max-[640px]:ml-0 max-[640px]:w-full">
              Clear filters
            </button>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {activeChips.map(([key, label]) => (
              <span key={key} className="flex items-center gap-1 rounded-full border border-line bg-paper-raised px-2.5 py-1 text-[11px]">
                {label}
                <button aria-label="Remove filter" onClick={() => updateFilter(key, "")}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {pageRows.length === 0 ? (
          <EmptyState icon={Search} title={emptyTitle} description={emptyDescription} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 border-collapse text-[13.3px]">
                <thead>
                  <tr>
                    <Th onClick={() => toggleSort("date")}>Date{sortArrow("date")}</Th>
                    <Th onClick={() => toggleSort("description")}>Description{sortArrow("description")}</Th>
                    <Th>Category / Account</Th>
                    <Th>Type</Th>
                    <Th onClick={() => toggleSort("amount")} align="right">
                      Amount{sortArrow("amount")}
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t) => (
                    <tr key={t.id} onClick={() => setSelectedTxn(t)} className="cursor-pointer border-b border-line hover:bg-paper-sunken">
                      <td className="px-3 py-3">{formatDate(t.date)}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold">{t.description}</div>
                        {t.memo && <div className="text-[12px] text-ink-faint">{t.memo}</div>}
                      </td>
                      <td className="px-3 py-3">{rowSubtext(t)}</td>
                      <td className="px-3 py-3">
                        <TxnBadge txn={t} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <TxnAmount txn={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3.5 flex items-center justify-between">
              <span className="text-[12.5px] text-ink-faint">
                {filteredSorted.length} transaction{filteredSorted.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <button disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken disabled:opacity-40">
                  Previous
                </button>
                <span className="text-[12.5px] text-ink-soft">
                  Page {currentPage} of {totalPages}
                </span>
                <button disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <TransactionForm open={addOpen} onOpenChange={setAddOpen} initialType={addType} />
      <TxnDetailDrawer txn={selectedTxn} open={!!selectedTxn} onOpenChange={(o) => !o && setSelectedTxn(null)} />
    </div>
  );
}

function Th({ children, onClick, align }: { children: React.ReactNode; onClick?: () => void; align?: "right" }) {
  return (
    <th
      onClick={onClick}
      className={`sticky top-0 whitespace-nowrap border-b border-line bg-paper-raised px-3 py-2 text-[11.5px] font-semibold text-ink-faint ${onClick ? "cursor-pointer select-none" : ""} ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}
