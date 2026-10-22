import { Fragment, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Transaction, TransactionGroup, TransactionType } from "@/types";
import type { TransactionGroupBy } from "@/types/api";
import { useAccounts, useCategories, useFriends, useTransactionGroups, useTransactions } from "@/hooks/queries";
import { useLookups } from "@/hooks/useLookups";
import { formatDate, formatSigned, clamp } from "@/lib/utils/format";
import { currentMonthRange, isDefaultRange, monthLabel, rangeLabel, rangeToFilters, type DateRange } from "@/lib/utils/dateRange";
import { TXN_TYPE_META } from "@/lib/utils/entityVisuals";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { DateRangeField } from "@/components/list/DateRangeField";
import { FilterField, ListToolbar, type SelectOption, type ToolbarChip } from "@/components/list/ListToolbar";
import { TxnBadge, TxnAmount } from "./chips";
import { TransactionForm } from "./TransactionForm";
import { TxnDetailDrawer } from "./TxnDetailDrawer";

interface FilterState {
  search: string;
  range: DateRange;
  accountId: string;
  categoryId: string;
  type: string;
  friendId: string;
}
const defaultFilters = (): FilterState => ({ search: "", range: currentMonthRange(), accountId: "", categoryId: "", type: "", friendId: "" });

type SortKey = "date" | "description" | "amount";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: SelectOption[] = [
  { value: "date:desc", label: "Newest first" },
  { value: "date:asc", label: "Oldest first" },
  { value: "amount:desc", label: "Amount, high to low" },
  { value: "amount:asc", label: "Amount, low to high" },
  { value: "description:asc", label: "Description A–Z" },
];

const GROUP_OPTIONS: SelectOption<"none" | TransactionGroupBy>[] = [
  { value: "none", label: "None" },
  { value: "date", label: "Day" },
  { value: "month", label: "Month" },
  { value: "category", label: "Category" },
  { value: "account", label: "Account" },
  { value: "type", label: "Type" },
];

const selectLook = "w-full";

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

  // The date filter starts on the current month; "All time" is a deliberate choice in the filters.
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [groupBy, setGroupBy] = useState<"none" | TransactionGroupBy>("none");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  // Wait for typing to pause before asking the server to search.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Filtering, sorting, grouping and paging all happen on the server.
  const baseFilters = {
    type: filters.type ? [filters.type as TransactionType] : allowedTypes,
    search: search || undefined,
    ...rangeToFilters(filters.range),
    accountId: filters.accountId ? Number(filters.accountId) : undefined,
    categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
    friendId: filters.friendId ? Number(filters.friendId) : undefined,
  };
  const grouped = groupBy !== "none";
  const query = useTransactions({
    ...baseFilters,
    sort: sortKey,
    direction: sortDir,
    groupBy: grouped ? groupBy : undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const groupsQuery = useTransactionGroups({ ...baseFilters, direction: sortKey === "date" ? sortDir : "desc", groupBy: grouped ? groupBy : undefined });
  const groupsByKey = new Map((groupsQuery.data ?? []).map((g) => [g.key, g]));

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
    setPage(1);
  }

  const isDefaultDate = isDefaultRange(filters.range);
  const rangeText = rangeLabel(filters.range);
  const filterCount =
    (isDefaultDate ? 0 : 1) + [filters.type, filters.accountId, filters.categoryId, filters.friendId].filter(Boolean).length;

  const chips: ToolbarChip[] = [];
  if (rangeText) chips.push({ key: "range", label: rangeText, onRemove: () => updateFilter("range", { mode: "all" }) });
  else chips.push({ key: "range", label: "All time" });
  if (filters.accountId) chips.push({ key: "accountId", label: `Account: ${accounts.find((a) => a.id === Number(filters.accountId))?.name ?? ""}`, onRemove: () => updateFilter("accountId", "") });
  if (filters.categoryId) chips.push({ key: "categoryId", label: `Category: ${lookups.getCategory(Number(filters.categoryId))?.name ?? ""}`, onRemove: () => updateFilter("categoryId", "") });
  if (filters.type) chips.push({ key: "type", label: `Type: ${TXN_TYPE_META[filters.type as TransactionType].label}`, onRemove: () => updateFilter("type", "") });
  if (filters.friendId) chips.push({ key: "friendId", label: `Friend: ${friends.find((f) => f.id === Number(filters.friendId))?.name ?? ""}`, onRemove: () => updateFilter("friendId", "") });

  function resetFilters() {
    setFilters((prev) => ({ ...defaultFilters(), search: prev.search }));
    setPage(1);
  }

  function groupTitle(key: string, fallback: string): string {
    if (groupBy === "date") return formatDate(key, "long");
    if (groupBy === "month") return monthLabel(key);
    if (groupBy === "type") return TXN_TYPE_META[key as TransactionType]?.label ?? fallback;
    return fallback;
  }

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

      <ListToolbar
        search={{ value: filters.search, onChange: (v) => updateFilter("search", v), placeholder: "Search description or memo" }}
        filters={{
          count: filterCount,
          onReset: resetFilters,
          children: (
            <>
              <FilterField label="Date">
                <DateRangeField value={filters.range} onChange={(r) => updateFilter("range", r)} />
              </FilterField>
              {showTypeFilter && (
                <FilterField label="Type">
                  <Select aria-label="Type" className={selectLook} value={filters.type} onChange={(e) => updateFilter("type", e.target.value)}>
                    <option value="">All types</option>
                    {allowedTypes.map((t) => (
                      <option key={t} value={t}>
                        {TXN_TYPE_META[t].label}
                      </option>
                    ))}
                  </Select>
                </FilterField>
              )}
              {showAccountFilter && (
                <FilterField label="Account">
                  <Select aria-label="Account" className={selectLook} value={filters.accountId} onChange={(e) => updateFilter("accountId", e.target.value)}>
                    <option value="">All accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </FilterField>
              )}
              {showCategoryFilter && (
                <FilterField label="Category">
                  <Select aria-label="Category" className={selectLook} value={filters.categoryId} onChange={(e) => updateFilter("categoryId", e.target.value)}>
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
                  </Select>
                </FilterField>
              )}
              {showFriendFilter && (
                <FilterField label="Friend">
                  <Select aria-label="Friend" className={selectLook} value={filters.friendId} onChange={(e) => updateFilter("friendId", e.target.value)}>
                    <option value="">All friends</option>
                    {friends.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </FilterField>
              )}
            </>
          ),
        }}
        group={{ value: groupBy, options: GROUP_OPTIONS, onChange: (v) => { setGroupBy(v as "none" | TransactionGroupBy); setPage(1); } }}
        sort={{
          value: `${sortKey}:${sortDir}`,
          options: SORT_OPTIONS,
          onChange: (v) => {
            const [k, d] = v.split(":");
            setSortKey(k as SortKey);
            setSortDir(d as SortDir);
            setPage(1);
          },
        }}
        chips={chips}
        onResetAll={filterCount > 0 ? resetFilters : undefined}
        resetLabel="Reset filters"
      />

      <div className="rounded-2xl border border-line bg-paper-raised p-5">
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
                  {pageRows.map((t, i) => {
                    const startsGroup = grouped && (i === 0 || pageRows[i - 1].groupKey !== t.groupKey);
                    const g = t.groupKey != null ? groupsByKey.get(t.groupKey) : undefined;
                    return (
                      <Fragment key={t.id}>
                        {startsGroup && (
                          <tr data-testid="group-header" className="border-y border-line bg-paper-sunken">
                            <td colSpan={4} className="px-3 py-2">
                              <span className="text-[13px] font-semibold">{groupTitle(t.groupKey ?? "", g?.label ?? "")}</span>
                              {g && <span className="ml-2 text-[12px] text-ink-soft">{g.count} transaction{g.count === 1 ? "" : "s"}</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-[12.5px] text-ink-soft">{g ? <GroupTotals group={g} /> : null}</td>
                          </tr>
                        )}
                        <tr onClick={() => setSelectedTxn(t)} className="cursor-pointer border-b border-line hover:bg-paper-sunken">
                          <td className="px-3 py-3">{formatDate(t.date)}</td>
                          <td className="px-3 py-3">
                            <div className="font-semibold">{t.description}</div>
                            {t.memo && <div className="text-[12px] text-ink-soft">{t.memo}</div>}
                          </td>
                          <td className="px-3 py-3">{rowSubtext(t)}</td>
                          <td className="px-3 py-3">
                            <TxnBadge txn={t} />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <TxnAmount txn={t} />
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3.5 flex items-center justify-between">
              <span className="text-[12.5px] text-ink-soft">
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

/** Money out and in for a group (per currency, zero sides hidden). */
function GroupTotals({ group }: { group: TransactionGroup }) {
  const parts = group.totals.flatMap((t) => [
    t.moneyOut ? formatSigned(t.moneyOut, "negative") : "",
    t.moneyIn ? formatSigned(t.moneyIn, "positive") : "",
  ]).filter(Boolean);
  return <span className="ledger-figure">{parts.join("  ")}</span>;
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
