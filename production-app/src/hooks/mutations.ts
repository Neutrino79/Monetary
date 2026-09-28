import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Account, Category, Friend, Transaction } from "@/types";
import { mockApi } from "@/lib/api/mockApi";
import { queryKeys } from "./queries";
import { useAuthStore } from "@/store/authStore";

function useLedgerMode() {
  const user = useAuthStore((s) => s.user);
  return user?.ledgerMode ?? "DIRECT";
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Transaction> & Pick<Transaction, "type" | "description" | "date" | "amount" | "currency">) => mockApi.createTransaction(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const ledgerMode = useLedgerMode();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Transaction> }) => mockApi.updateTransaction(id, patch, ledgerMode),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const ledgerMode = useLedgerMode();
  return useMutation({
    mutationFn: (id: string) => mockApi.deleteTransaction(id, ledgerMode),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
  });
}

export function useSettleFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { friendId: string; accountId: string; amount: number; direction: "receive" | "pay"; memo?: string | null; date?: string }) => mockApi.settleFriend(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Account> & Pick<Account, "name" | "accountType" | "subtype">) => mockApi.createAccount(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Account> }) => mockApi.updateAccount(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}
export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mockApi.archiveAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}
export function useRestoreAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mockApi.restoreAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Category> & Pick<Category, "name">) => mockApi.createCategory(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Category> }) => mockApi.updateCategory(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mockApi.deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}

export function useCreateFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Friend> & Pick<Friend, "name" | "email">) => mockApi.createFriend(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.friends }),
  });
}
export function useUpdateFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Friend> }) => mockApi.updateFriend(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.friends }),
  });
}
export function useDeleteFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mockApi.deleteFriend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.friends }),
  });
}
