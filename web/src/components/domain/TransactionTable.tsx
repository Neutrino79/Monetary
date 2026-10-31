import { Fragment, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Plus, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { Transaction, TransactionType } from "@/types";
import type { TransactionGroupBy } from "@/types/api";
import { useAccounts, useCategories, useFriends, useTags, useTransactionGroups, useTransactions } from "@/hooks/queries";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useLookups } from "@/hooks/useLookups";
import { formatDate, clamp } from "@/lib/utils/format";
import { currentMonthRange, monthLabel, rangeToFilters, type DateRange } from "@/lib/utils/dateRange";
import { TXN_TYPE_META } from "@/lib/utils/entityVisuals";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/form";
import { EmptyState, LoadFailed, Skeleton } from "@/components/ui/primitives";
import { ControlStrip, FilterField, StripDate, StripFilters, StripGroup, StripSearch, type GroupOption } from "@/components/list/ControlStrip";
import { TxnBadge, TxnAmount } from "./chips";
import { cn } from "@/lib/utils/cn";
import { TransactionForm } from "./TransactionForm";
import { TxnDetailDrawer } from "./TxnDetailDrawer";

interface FilterState {
  search: string;
  range: DateRange;
  accountId: string;
  categoryId: string;
  type: string;
  friendId: string;
  tag: string;
}
const defaultFilters = (): FilterState => ({ search: "", range: currentMonthRange(), accountId: "", categoryId: "", type: "", friendId: "", tag: "" });

type SortKey = "date" | "description" | "amount" | "category" | "account";
type SortDir = "asc" | "desc";

const GROUP_OPTIONS: (GroupOption & { value: "none" | TransactionGroupBy })[] = [
  { value: "none", label: "None" },
  { value: "date", label: "Day" },
  { value: "month", label: "Month" },
  { value: "category", label: "Category" },
  { value: "account", label: "Account" },
  { value: "type", label: "Type" },
  { value: "tag", label: "Tag" },
];

const selectLook = "w-full";

type TableProps = React.ComponentProps<typeof TransactionTableInner>;

/** Opens on the filters in the link (`?category=`, `?month=`, `?date=`, `?tag=`); following another such link starts afresh. */
export function TransactionTable(props: TableProps) {
  const [params] = useSearchParams();
  return <TransactionTableInner key={params.toString()} {...props} />;
}

function TransactionTableInner({
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
  headerExtra,
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
  /** Page-specific controls shown between the title and the toolbar (e.g. Shared's "Paid by"). */
  headerExtra?: React.ReactNode;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: friends = [] } = useFriends();
  const { data: allTags = [] } = useTags();
  const lookups = useLookups();
  const isPhone = useMediaQuery("(max-width: 640px)");

  // The date filter starts on the current month; "All time" is a deliberate choice in the filters.
  // Links from elsewhere (a budget on the Dashboard) can open the list on a category and month.
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(() => {
    const f = defaultFilters();
    const category = params.get("category");
    const month = params.get("month");
    const tag = params.get("tag");
    if (tag) {
      f.tag = tag;
      if (!month) f.range = { mode: "all" };      // a tag link is about the tag, not this month
    }
    if (category && /^\d+$/.test(category)) f.categoryId = category;
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) f.range = { mode: "month", month };
    // a run of months, from the Reports page: ?from=2026-05&to=2026-10 (the last month stops at today)
    const from = params.get("from");
    const to = params.get("to");
    const isMonth = (v: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
    if (isMonth(from) && isMonth(to) && from <= to) {
      const r = rangeToFilters({ mode: "month", month: to });
      f.range = { mode: "custom", from: `${from}-01`, to: r.dateTo ?? `${to}-01` };
    }
    const date = params.get("date");
    if (date && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) f.range = { mode: "custom", from: date, to: date };   // one day, from the pace chart
    return f;
  });
  const [groupBy, setGroupBy] = useState<"none" | TransactionGroupBy>("none");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  /** Group headers the user has folded away (this page of results only). */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
    tag: filters.tag ? [filters.tag] : undefined,
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

  // a different set of allowed types (e.g. Shared's "Paid by") starts again from page 1
  const typesKey = allowedTypes.join(",");
  useEffect(() => setPage(1), [typesKey]);

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // numbers and dates start high-to-low, names start A-Z
      setSortDir(key === "date" || key === "amount" ? "desc" : "asc");
    }
    setPage(1);
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // The date lives in the strip, so the Filters badge counts only the rest.
  const filterCount = [filters.type, filters.accountId, filters.categoryId, filters.friendId, filters.tag].filter(Boolean).length;

  function resetFilters() {
    // Clears the filters in the panel; the date and the search box stay as they are.
    setFilters((prev) => ({ ...prev, type: "", accountId: "", categoryId: "", friendId: "", tag: "" }));
    setPage(1);
  }

  function groupTitle(key: string, fallback: string): string {
    if (groupBy === "date") return formatDate(key, "long");
    if (groupBy === "month") return monthLabel(key);
    if (groupBy === "type") return TXN_TYPE_META[key as TransactionType]?.label ?? fallback;
    return fallback;
  }

  function categoryText(t: Transaction): string {
    if (t.type === "transfer") return "Transfer";
    if (t.type === "settlement") return "Settlement";
    return t.categoryId ? lookups.getCategory(t.categoryId)?.name ?? "\u2014" : "\u2014";
  }
  function accountText(t: Transaction): string {
    if (t.type === "transfer") return `${lookups.getAccount(t.accountId)?.name} \u2192 ${lookups.getAccount(t.toAccountId)?.name}`;
    if (t.type === "fronted") return `${lookups.getFriend(t.friendId)?.name ?? "A friend"} paid`;
    return lookups.getAccount(t.accountId)?.name ?? "\u2014";
  }
  /** Phone rows have one line for both: "Food · HDFC Bank". */
  function rowSubtext(t: Transaction): string {
    return [categoryText(t), accountText(t)].filter((x) => x && x !== "\u2014").join(" \u00b7 ");
  }

  /** The category as its colour dot and name; transfers and settlements are neutral. */
  function categoryPill(t: Transaction) {
    const name = categoryText(t);
    if (name === "\u2014") return <span className="text-ink-faint">{name}</span>;
    const color = t.categoryId ? lookups.getCategory(t.categoryId)?.color : undefined;
    const valid = !!color && /^#[0-9a-f]{6}$/i.test(color);
    return (
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: valid ? color : "var(--color-ink-faint)" }} />
        {name}
      </span>
    );
  }

  const colCount = 7;
  const sortHead = (label: string, key: SortKey, align?: "right") => (
    <SortTh label={label} active={sortKey === key} dir={sortDir} onClick={() => toggleSort(key)} align={align} />
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-3">
        <h1 className="mr-auto text-2xl font-semibold">{title}</h1>
        <p className="sr-only">{description}</p>

        <ControlStrip className="order-last w-full sm:order-none sm:w-auto">
          <StripSearch value={filters.search} onChange={(v) => updateFilter("search", v)} placeholder="Search description or memo" />
          <StripDate value={filters.range} onChange={(r) => updateFilter("range", r)} />
          <StripFilters count={filterCount} resultCount={query.data ? total : undefined} onReset={resetFilters}>
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
            {(allTags.length > 0 || filters.tag) && (
              <FilterField label="Tag">
                <Select aria-label="Tag" className={selectLook} value={filters.tag} onChange={(e) => updateFilter("tag", e.target.value)}>
                  <option value="">All tags</option>
                  {[...new Set([...allTags.map((t) => t.name), ...(filters.tag ? [filters.tag] : [])])].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
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
          </StripFilters>
          <StripGroup
            value={groupBy}
            options={GROUP_OPTIONS}
            onChange={(v) => {
              setGroupBy(v as "none" | TransactionGroupBy);
              setCollapsed(new Set());
              setPage(1);
            }}
          />
        </ControlStrip>

        <Button onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add {title === "Transactions" ? "transaction" : addType === "fronted" ? "friend-paid expense" : addType}
        </Button>
      </div>

      {headerExtra}

      {groupBy === "tag" && (
        <p className="mb-3 text-caption text-ink-faint">A transaction with several tags is listed under each of them, so group counts can add up to more than the total.</p>
      )}

      <div className="overflow-hidden rounded-card border border-line bg-paper-raised">
        {query.isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-control" />)}
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <LoadFailed what="transactions" error={query.error} onRetry={() => query.refetch()} icon={Search} />
          </div>
        ) : pageRows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Search} title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <>
            {!isPhone && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-176 border-collapse text-body">
                <thead>
                  <tr className="border-b border-line bg-paper-sunken">
                    {sortHead("Date", "date")}
                    {sortHead("Description", "description")}
                    <Th>Type</Th>
                    {sortHead("Category", "category")}
                    {sortHead("Account", "account")}
                    <Th>Tags</Th>
                    {sortHead("Amount", "amount", "right")}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t, i) => {
                    const startsGroup = grouped && (i === 0 || pageRows[i - 1].groupKey !== t.groupKey);
                    const g = t.groupKey != null ? groupsByKey.get(t.groupKey) : undefined;
                    const folded = grouped && t.groupKey != null && collapsed.has(t.groupKey);
                    return (
                      <Fragment key={`${t.id}-${t.groupKey ?? ""}`}>
                        {startsGroup && (
                          <tr data-testid="group-header" className="border-b border-line bg-paper">
                            <td colSpan={colCount} className="p-0">
                              <button
                                type="button"
                                aria-expanded={!folded}
                                onClick={() => toggleGroup(t.groupKey ?? "")}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-paper-sunken"
                              >
                                <ChevronDown size={14} aria-hidden className={cn("flex-none text-ink-faint transition-transform", folded && "-rotate-90")} />
                                {groupBy === "category" && t.groupKey && <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: lookups.getCategory(Number(t.groupKey))?.color ?? "var(--color-ink-faint)" }} />}
                                <span className="text-body font-semibold">{groupTitle(t.groupKey ?? "", g?.label ?? "")}</span>
                                {g && <span className="text-caption text-ink-faint">{g.count} transaction{g.count === 1 ? "" : "s"}</span>}
                              </button>
                            </td>
                          </tr>
                        )}
                        {!folded && (
                          <tr onClick={() => setSelectedTxn(t)} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-paper-sunken">
                            <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatDate(t.date)}</td>
                            <td className="max-w-80 px-4 py-3">
                              <div className="font-semibold">{t.description}</div>
                              {t.memo && <div title={t.memo} className="truncate text-caption text-ink-soft">{t.memo.split(/\r?\n/)[0]}</div>}
                            </td>
                            <td className="px-4 py-3"><TxnBadge txn={t} /></td>
                            <td className="px-4 py-3">{categoryPill(t)}</td>
                            <td className="px-4 py-3 text-ink-soft">{accountText(t)}</td>
                            <td className="px-4 py-3">
                              {t.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1" aria-label="Tags">
                                  {t.tags.map((tag) => (
                                    <span key={tag} className="rounded-full bg-paper-sunken px-2 py-px text-micro text-ink-soft">{tag}</span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-ink-faint">{"—"}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <TxnAmount txn={t} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            {/* phones: one card-like row per transaction, so the amount is never off-screen */}
            {isPhone && (
            <ul aria-label="Transactions" className="px-4">
              {pageRows.map((t, i) => {
                const startsGroup = grouped && (i === 0 || pageRows[i - 1].groupKey !== t.groupKey);
                const g = t.groupKey != null ? groupsByKey.get(t.groupKey) : undefined;
                const folded = grouped && t.groupKey != null && collapsed.has(t.groupKey);
                return (
                  <Fragment key={`${t.id}-${t.groupKey ?? ""}`}>
                    {startsGroup && (
                      <li className="-mx-4 border-y border-line bg-paper">
                        <button type="button" aria-expanded={!folded} onClick={() => toggleGroup(t.groupKey ?? "")} className="flex w-full items-center gap-2 px-4 py-2 text-left">
                          <ChevronDown size={14} aria-hidden className={cn("flex-none text-ink-faint transition-transform", folded && "-rotate-90")} />
                          <span className="text-body font-semibold">{groupTitle(t.groupKey ?? "", g?.label ?? "")}</span>
                          {g && <span className="text-caption text-ink-faint">{g.count}</span>}
                        </button>
                      </li>
                    )}
                    {!folded && (
                      <li className="border-b border-line last:border-b-0">
                        <button type="button" onClick={() => setSelectedTxn(t)} className="flex w-full items-start gap-3 py-3 text-left">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-semibold">{t.description}</div>
                            <div className="truncate text-caption text-ink-soft">
                              {formatDate(t.date, "short")} · {rowSubtext(t)}
                            </div>
                          </div>
                          <div className="flex flex-none flex-col items-end gap-1">
                            <TxnAmount txn={t} />
                            <TxnBadge txn={t} />
                          </div>
                        </button>
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ul>
            )}
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <span className="text-caption text-ink-soft">
                {total} transaction{total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <button disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-control px-3 py-1.5 text-caption font-semibold text-ink-soft hover:bg-paper-sunken disabled:opacity-40">
                  Previous
                </button>
                <span className="text-caption text-ink-soft">
                  Page {currentPage} of {totalPages}
                </span>
                <button disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-control px-3 py-1.5 text-caption font-semibold text-ink-soft hover:bg-paper-sunken disabled:opacity-40">
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

/** A header cell that sorts the table: a faint up-down mark when idle, an arrow for the active column. */
function SortTh({ label, active, dir, onClick, align }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; align?: "right" }) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap px-4 py-0 text-caption font-semibold", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={onClick}
        className={cn("inline-flex h-[42px] items-center gap-1.5 hover:text-ink", active ? "text-ink" : "text-ink-soft", align === "right" && "flex-row-reverse")}
      >
        {label}
        <Icon size={12} aria-hidden strokeWidth={active ? 2.6 : 2.2} className={active ? "text-ink" : "text-ink-faint/70"} />
      </button>
    </th>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="h-[42px] whitespace-nowrap px-4 text-left text-caption font-semibold text-ink-soft">{children}</th>;
}
