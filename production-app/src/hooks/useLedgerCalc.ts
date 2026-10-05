/**
 * Binds the pure functions in `lib/domain/ledgerCalculations.ts` to the
 * live TanStack Query data (mock or real backend, whichever is active),
 * so components never need to know where the data came from.
 */
import { useMemo } from "react";
import type { DateRange } from "@/types";
import { useAccounts, useCategories, useFriends, useIncomeSources, useTransactions } from "./queries";
import { appConfig } from "@/config/app";
import { today } from "@/lib/utils/clock";
import * as calc from "@/lib/domain/ledgerCalculations";

export function useLedgerCalc() {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: friends = [] } = useFriends();
  const { data: transactions = [] } = useTransactions();

  const anchor = today();

  return useMemo(() => {
    return {
      accounts,
      categories,
      incomeSources,
      friends,
      transactions,
      today: anchor,
      getAccount: (id: string | undefined) => calc.getAccount(accounts, id),
      getCategory: (id: string | undefined) => calc.getCategory(categories, incomeSources, id),
      getFriend: (id: string | undefined) => calc.getFriend(friends, id),
      categoryChildren: (id: string) => calc.categoryChildren(categories, id),
      categoryRoots: () => calc.categoryRoots(categories),
      activeTxns: (extra?: (t: (typeof transactions)[number]) => boolean) => calc.activeTxns(transactions, extra),
      calcAccountBalance: (accountId: string, asOfDate?: string) => calc.calcAccountBalance(accounts, transactions, accountId, asOfDate),
      calcNetWorth: () => calc.calcNetWorth(accounts, transactions),
      calcFriendOutstanding: (friendId: string) => calc.calcFriendOutstanding(transactions, friendId),
      calcCategorySpend: (categoryId: string, range?: DateRange) => calc.calcCategorySpend(categories, transactions, categoryId, range),
      calcTotalExpenses: (range?: DateRange) => calc.calcTotalExpenses(transactions, range),
      calcTotalIncome: (range?: DateRange) => calc.calcTotalIncome(transactions, range),
      calcBudgetUsage: (range?: DateRange) => calc.calcBudgetUsage(categories, transactions, range),
      monthRange: (monthsBack: number) => calc.monthRange(anchor, monthsBack),
      lastNMonthsBuckets: (n: number) => calc.lastNMonthsBuckets(anchor, n, appConfig.locale),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, categories, incomeSources, friends, transactions, anchor]);
}
