import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Branding, Id, MonthSpan } from "@/types";
import type { TransactionFilters } from "@/types/api";
import { appConfig } from "@/config/app";
import { useAuthStore } from "@/store/authStore";
import { metaService } from "@/lib/api/services/metaService";
import { accountsService } from "@/lib/api/services/accountsService";
import { categoriesService } from "@/lib/api/services/categoriesService";
import { incomeSourcesService } from "@/lib/api/services/incomeSourcesService";
import { friendsService } from "@/lib/api/services/friendsService";
import { transactionsService } from "@/lib/api/services/transactionsService";
import { reportsService } from "@/lib/api/services/reportsService";
import { tagsService } from "@/lib/api/services/tagsService";
import { authService } from "@/lib/api/services/authService";

/** Query keys. Everything that changes the ledger invalidates the "ledger" family together (see mutations.ts). */
export const qk = {
  branding: ["branding"] as const,
  setup: ["setup-status"] as const,
  securityQuestions: ["security-questions"] as const,
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  incomeSources: ["income-sources"] as const,
  tags: ["tags"] as const,
  friends: ["friends"] as const,
  friendBalances: ["friends", "balances"] as const,
  accountStatement: (id: Id) => ["accounts", "statement", id] as const,
  friendStatement: (id: Id) => ["friends", "statement", id] as const,
  friendBills: (id: Id, open: boolean) => ["friends", "bills", id, open] as const,
  friendMatches: (id: Id) => ["friends", "matches", id] as const,
  unassignedPayments: (id: Id) => ["friends", "unassigned", id] as const,
  transactions: (f: TransactionFilters) => ["transactions", f] as const,
  transactionGroups: (f: TransactionFilters) => ["transactions", "groups", f] as const,
  transaction: (id: Id) => ["transaction", id] as const,
  dashboard: (month?: string) => ["reports", "dashboard", month ?? "current"] as const,
  cashflow: (months: number) => ["reports", "cashflow", months] as const,
  spending: (month?: string) => ["reports", "spending", month ?? "current"] as const,
  overview: (months: number) => ["reports", "overview", months] as const,
  categoriesReport: (months: number, kind: string) => ["reports", "categories", months, kind] as const,
  compare: (a: MonthSpan, b: MonthSpan) => ["reports", "compare", a, b] as const,
  budgetHistory: (months: number) => ["reports", "budget-history", months] as const,
  outlook: (months: number) => ["reports", "outlook", months] as const,
  spendingPace: (month?: string) => ["reports", "spending-pace", month ?? "current"] as const,
};

/**
 * The product name/tagline. Owned by the backend (`GET /meta`); the build-time
 * values in `appConfig` are only the placeholder shown before it arrives or if
 * the backend can't be reached.
 */
export function useBranding(): Branding {
  const { data } = useQuery({
    queryKey: qk.branding, queryFn: metaService.getBranding, staleTime: Infinity, retry: 1,
  });
  return data ?? { name: appConfig.name, tagline: appConfig.tagline };
}

/** Whether the server runs in demo mode; `isLoading` lets a page wait instead of flashing the normal UI. */
export function useDemoMode(): { isDemo: boolean; isLoading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: qk.branding, queryFn: metaService.getBranding, staleTime: Infinity, retry: 1,
  });
  return { isDemo: data?.demo === true, isLoading: isPending };
}

export function useSetupStatus() {
  return useQuery({ queryKey: qk.setup, queryFn: metaService.isSetupComplete, staleTime: 0, retry: 1 });
}

export function useSecurityQuestions() {
  return useQuery({ queryKey: qk.securityQuestions, queryFn: authService.securityQuestions, staleTime: Infinity });
}

export function useAccounts() {
  return useQuery({ queryKey: qk.accounts, queryFn: () => accountsService.list(true) });
}

/** Active expense categories (roots and children). */
export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: () => categoriesService.list("EXPENSE") });
}

export function useIncomeSources() {
  return useQuery({ queryKey: qk.incomeSources, queryFn: incomeSourcesService.list });
}

export function useFriends() {
  return useQuery({ queryKey: qk.friends, queryFn: friendsService.list });
}

export function useFriendBalances() {
  return useQuery({ queryKey: qk.friendBalances, queryFn: friendsService.balances });
}

/** Every configured tag, for the picker, the filter and the tag manager. */
export function useTags() {
  return useQuery({ queryKey: qk.tags, queryFn: () => tagsService.list() });
}

export function useAccountStatement(id: Id | undefined) {
  return useQuery({ queryKey: qk.accountStatement(id ?? 0), queryFn: () => accountsService.statement(id!), enabled: id != null });
}

export function useFriendStatement(id: Id | undefined) {
  return useQuery({ queryKey: qk.friendStatement(id ?? 0), queryFn: () => friendsService.statement(id!), enabled: id != null });
}

/** The splits a friend owes you and the expenses they paid for you, with paid / matched / remaining. */
export function useFriendBills(id: Id | undefined, onlyOpen = false) {
  return useQuery({ queryKey: qk.friendBills(id ?? 0, onlyOpen), queryFn: () => friendsService.bills(id!, onlyOpen), enabled: id != null });
}

export function useFriendMatches(id: Id | undefined) {
  return useQuery({ queryKey: qk.friendMatches(id ?? 0), queryFn: () => friendsService.matches(id!), enabled: id != null });
}

/** Old payments not tied to any bill yet; the friend cannot take new payments until these are linked. */
export function useUnassignedPayments(id: Id | undefined) {
  return useQuery({ queryKey: qk.unassignedPayments(id ?? 0), queryFn: () => friendsService.unassignedPayments(id!), enabled: id != null });
}

/** A server-filtered, server-sorted, server-paged page of transactions. */
export function useTransactions(filters: TransactionFilters = {}, enabled = true) {
  return useQuery({
    queryKey: qk.transactions(filters), queryFn: () => transactionsService.list(filters),
    placeholderData: keepPreviousData, enabled,
  });
}

/** Group headers for a grouped list (pass the same filters as `useTransactions`). */
export function useTransactionGroups(filters: TransactionFilters & { groupBy?: NonNullable<TransactionFilters["groupBy"]> }, enabled = true) {
  const { groupBy } = filters;
  return useQuery({
    queryKey: qk.transactionGroups(filters), enabled: enabled && !!groupBy, placeholderData: keepPreviousData,
    queryFn: () => transactionsService.groups({ ...filters, groupBy: groupBy! }),
  });
}

export function useTransaction(id: Id | undefined) {
  return useQuery({
    queryKey: qk.transaction(id ?? 0), queryFn: () => transactionsService.get(id!), enabled: id != null,
  });
}

export function useDashboard(month?: string) {
  const currency = useAuthStore((s) => s.user?.homeCurrencyCode ?? appConfig.currencyCode);
  return useQuery({
    queryKey: [...qk.dashboard(month), currency], queryFn: () => reportsService.dashboard(currency, month),
    placeholderData: keepPreviousData,
  });
}

export function useCashflow(months = 6) {
  return useQuery({ queryKey: qk.cashflow(months), queryFn: () => reportsService.cashflow(months) });
}

export function useSpending(month?: string) {
  return useQuery({
    queryKey: qk.spending(month), queryFn: () => reportsService.spending(month), placeholderData: keepPreviousData,
  });
}

export function useSpendingPace(month?: string) {
  return useQuery({
    queryKey: qk.spendingPace(month), queryFn: () => reportsService.spendingPace(month), placeholderData: keepPreviousData,
  });
}

const keep = { placeholderData: keepPreviousData } as const;
export const useOverview = (months: number) => useQuery({ queryKey: qk.overview(months), queryFn: () => reportsService.overview(months), ...keep });
export const useCategoriesReport = (months: number, kind: "spending" | "income") =>
  useQuery({ queryKey: qk.categoriesReport(months, kind), queryFn: () => reportsService.categoriesReport(months, kind), ...keep });
export const useCompare = (a: MonthSpan, b: MonthSpan) => useQuery({ queryKey: qk.compare(a, b), queryFn: () => reportsService.compare(a, b), ...keep });
export const useBudgetHistory = (months: number) => useQuery({ queryKey: qk.budgetHistory(months), queryFn: () => reportsService.budgetHistory(months), ...keep });
export const useOutlook = (months: number) => useQuery({ queryKey: qk.outlook(months), queryFn: () => reportsService.outlook(months), ...keep });
