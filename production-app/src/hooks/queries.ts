import { useQuery } from "@tanstack/react-query";
import { mockApi } from "@/lib/api/mockApi";

export const queryKeys = {
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  incomeSources: ["incomeSources"] as const,
  friends: ["friends"] as const,
  transactions: ["transactions"] as const,
};

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: mockApi.getAccounts });
}
export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: mockApi.getCategories });
}
export function useIncomeSources() {
  return useQuery({ queryKey: queryKeys.incomeSources, queryFn: mockApi.getIncomeSources });
}
export function useFriends() {
  return useQuery({ queryKey: queryKeys.friends, queryFn: mockApi.getFriends });
}
export function useTransactions() {
  return useQuery({ queryKey: queryKeys.transactions, queryFn: mockApi.getTransactions });
}

/** Convenience: fetch everything the app shell needs before first paint. */
export function useCoreData() {
  const accounts = useAccounts();
  const categories = useCategories();
  const incomeSources = useIncomeSources();
  const friends = useFriends();
  const transactions = useTransactions();
  const isLoading = accounts.isLoading || categories.isLoading || incomeSources.isLoading || friends.isLoading || transactions.isLoading;
  const isError = accounts.isError || categories.isError || incomeSources.isError || friends.isError || transactions.isError;
  return {
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    incomeSources: incomeSources.data ?? [],
    friends: friends.data ?? [],
    transactions: transactions.data ?? [],
    isLoading,
    isError,
  };
}
