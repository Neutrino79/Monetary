import { useMemo } from "react";
import type { Account, Category, Friend, Id, IncomeSource } from "@/types";
import { useAccounts, useCategories, useFriends, useIncomeSources } from "./queries";

/**
 * id -> entity lookups over the server-provided lists. Pure indexing for
 * rendering names/colours; no business calculation lives in the browser.
 */
export function useLookups() {
  const accounts = useAccounts().data;
  const categories = useCategories().data;
  const sources = useIncomeSources().data;
  const friends = useFriends().data;

  return useMemo(() => {
    const accountById = new Map<Id, Account>((accounts ?? []).map((a) => [a.id, a]));
    const categoryById = new Map<Id, Category | IncomeSource>([...(categories ?? []), ...(sources ?? [])].map((c) => [c.id, c]));
    const friendById = new Map<Id, Friend>((friends ?? []).map((f) => [f.id, f]));
    return {
      getAccount: (id?: Id | null) => (id == null ? undefined : accountById.get(id)),
      /** Works for expense categories and income sources alike. */
      getCategory: (id?: Id | null) => (id == null ? undefined : categoryById.get(id)),
      getFriend: (id?: Id | null) => (id == null ? undefined : friendById.get(id)),
      rootCategories: (categories ?? []).filter((c) => c.parentId == null),
      childrenOf: (id: Id) => (categories ?? []).filter((c) => c.parentId === id),
    };
  }, [accounts, categories, sources, friends]);
}
