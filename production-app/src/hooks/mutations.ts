import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Account, Category, Friend, Transaction } from "@/types";
import type { NewAccountInput, NewCategoryInput, NewFriendInput, NewTransactionInput, SettlementInput } from "@/types/api";
import { accountsService } from "@/lib/api/services/accountsService";
import { categoriesService } from "@/lib/api/services/categoriesService";
import { friendsService } from "@/lib/api/services/friendsService";
import { transactionsService } from "@/lib/api/services/transactionsService";
import { queryKeys } from "./queries";
import { useAuthStore } from "@/store/authStore";

function useLedgerMode() {
  const user = useAuthStore((s) => s.user);
  return user?.ledgerMode ?? "DIRECT";
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NewTransactionInput) => transactionsService.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const ledgerMode = useLedgerMode();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Transaction> }) => transactionsService.update(id, patch, ledgerMode),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const ledgerMode = useLedgerMode();
  return useMutation({
    mutationFn: (id: string) => transactionsService.remove(id, ledgerMode),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
  });
}

export function useSettleFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: SettlementInput) => transactionsService.settleFriend(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NewAccountInput) => accountsService.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Account> }) => accountsService.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}
export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountsService.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}
export function useRestoreAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountsService.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NewCategoryInput) => categoriesService.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Category> }) => categoriesService.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoriesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}

export function useCreateFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NewFriendInput) => friendsService.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.friends }),
  });
}
export function useUpdateFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Friend> }) => friendsService.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.friends }),
  });
}
export function useDeleteFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => friendsService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.friends }),
  });
}
