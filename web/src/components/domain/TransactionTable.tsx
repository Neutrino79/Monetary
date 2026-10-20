import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { Transaction, TransactionType } from "@/types";
import { useAccounts, useCategories, useFriends, useTransactions } from "@/hooks/queries";
import { useLookups } from "@/hooks/useLookups";
import { today } from "@/lib/utils/clock";
import { formatDate, clamp } from "@/lib/utils/format";
import { TXN_TYPE_META } from "@/lib/utils/entityVisuals";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
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
  const lookups = useLookups();
  const todayStr = today();

  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  // Wait for typing to pause before asking the server to search.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Filtering, sorting and paging all happen on the server.
  const query = useTransactions({
    type: filters.type ? [filters.type as TransactionType] : allowedTypes,
    search: search || undefined,
    dateFrom: filters.from || undefined,
    dateTo: filters.to || undefined,
    accountId: filters.accountId ? Number(filters.accountId) : undefined,
    categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
    friendId: filters.friendId ? Number(filters.friendId) : undefined,
    sort: sortKey,
    direction: sortDir,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const pageRows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = clamp(page, 1, totalPages);

  // e.g. after deleting the only row on the last page
  useEffect(() => {
    if (query.data && page > totalPages) setPage(totalPages);
  }, [query.data, page, totalPages]);

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
  if (filters.accountId) activeChips.push(["accountId", accounts.find((a) => a.id === Number(filters.accountId))?.name ?? ""]);
  if (filters.categoryId) activeChips.push(["categoryId", lookups.getCategory(Number(filters.categoryId))?.name ?? ""]);
  if (filters.type) activeChips.push(["type", TXN_TYPE_META[filters.type as TransactionType].label]);
  if (filters.friendId) activeChips.push(["friendId", friends.find((f) => f.id === Number(filters.friendId))?.name ?? ""]);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 opacity-60">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  }

  function rowSubtext(t: Transaction): string {
    if (t.type === "transfer") return `${lookups.getAccount(t.accountId)?.name} \u2192 ${lookups.getAccount(t.toAccountId)?.name}`;
    if (t.type === "settlement") return lookups.getFriend(t.friendId)?.name ?? "";
    if (t.type === "fronted") return `${lookups.getFriend(t.friendId)?.name ?? ""} paid · ${lookups.getCategory(t.categoryId)?.name ?? "\u2014"}`;
    if (t.categoryId) return lookups.getCategory(t.categoryId)?.name ?? "\u2014";
    return lookups.getAccount(t.accountId)?.name ?? "";
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
            <input type="date" value={filters.from} max={todayStr} onChange={(e) => updateFilter("from", e.target.value)} title="From date" className="min-w-30 max-w-42.5 flex-1 basis-32.5 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.3px]" />
            <input type="date" value={filters.to} max={todayStr} onChange={(e) => updateFilter("to", e.target.value)} title="To date" className="min-w-30 max-w-42.5 flex-1 basis-32.5 rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.3px]" />
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
                      {lookups.childrenOf(root.id).map((k) => (
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

        {query.isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-[10px]" />)}
          </div>
        ) : query.isError ? (
          <EmptyState icon={Search} title="Couldn't load transactions" description={query.error instanceof Error ? query.error.message : "Please try again."} />
        ) : pageRows.length === 0 ? (
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
                {total} transaction{total === 1 ? "" : "s"}
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
