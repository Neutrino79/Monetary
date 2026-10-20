import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Id } from "@/types";
import type {
  AccountPatch, CategoryPatch, FriendPatch, NewAccountInput, NewCategoryInput, NewFriendInput, NewTransactionInput,
  SettlementInput, TransactionPatch, TransactionWriteOptions,
} from "@/types/api";
import { accountsService } from "@/lib/api/services/accountsService";
import { categoriesService } from "@/lib/api/services/categoriesService";
import { friendsService } from "@/lib/api/services/friendsService";
import { transactionsService } from "@/lib/api/services/transactionsService";
import { qk } from "./queries";

/**
 * Any ledger change can move account balances, friend balances, budgets and every
 * report, and the backend computes all of those -- so refetch the whole family
 * instead of hand-patching caches.
 */
export function invalidateLedger(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["transactions"] }),
    qc.invalidateQueries({ queryKey: ["transaction"] }),
    qc.invalidateQueries({ queryKey: qk.accounts }),
    qc.invalidateQueries({ queryKey: qk.friends }),
    qc.invalidateQueries({ queryKey: ["reports"] }),
  ]);
}

function useLedgerMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>, extraKeys: readonly (readonly unknown[])[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([invalidateLedger(qc), ...extraKeys.map((k) => qc.invalidateQueries({ queryKey: k }))]);
    },
  });
}

// ------------------------------------------------------------- transactions
export const useCreateTransaction = () => useLedgerMutation((p: NewTransactionInput) => transactionsService.create(p));
export const useUpdateTransaction = () =>
  useLedgerMutation(({ id, patch, opts }: { id: Id; patch: TransactionPatch; opts?: TransactionWriteOptions }) =>
    transactionsService.update(id, patch, opts));
export const useDeleteTransaction = () =>
  useLedgerMutation(({ id, opts }: { id: Id; opts?: TransactionWriteOptions }) => transactionsService.remove(id, opts));
export const useSettleFriend = () => useLedgerMutation((s: SettlementInput) => transactionsService.settle(s));

// ----------------------------------------------------------------- accounts
export const useCreateAccount = () => useLedgerMutation((p: NewAccountInput) => accountsService.create(p));
export const useUpdateAccount = () => useLedgerMutation(({ id, patch }: { id: Id; patch: AccountPatch }) => accountsService.update(id, patch));
export const useArchiveAccount = () => useLedgerMutation((id: Id) => accountsService.archive(id));
export const useRestoreAccount = () => useLedgerMutation((id: Id) => accountsService.restore(id));

// ------------------------------------------------------- categories / income
const categoryKeys = [qk.categories, qk.incomeSources] as const;
export const useCreateCategory = () => useLedgerMutation((p: NewCategoryInput) => categoriesService.create(p), categoryKeys);
export const useUpdateCategory = () =>
  useLedgerMutation(({ id, patch }: { id: Id; patch: CategoryPatch }) => categoriesService.update(id, patch), categoryKeys);
export const useArchiveCategory = () => useLedgerMutation((id: Id) => categoriesService.archive(id), categoryKeys);

// ------------------------------------------------------------------ friends
export const useCreateFriend = () => useLedgerMutation((p: NewFriendInput) => friendsService.create(p));
export const useUpdateFriend = () => useLedgerMutation(({ id, patch }: { id: Id; patch: FriendPatch }) => friendsService.update(id, patch));
export const useDeleteFriend = () => useLedgerMutation((id: Id) => friendsService.remove(id));
