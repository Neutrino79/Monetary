/**
 * Transaction (journal entry) endpoints. Real REST shape this stands in for:
 *   GET    /transactions
 *   POST   /transactions
 *   PATCH  /transactions/:id              (body includes ledgerMode so the
 *                                          server knows whether to reverse+
 *                                          repost or mutate in place)
 *   DELETE /transactions/:id?ledgerMode=…
 *   POST   /friends/:id/settle
 */
import type { Transaction } from "@/types";
import type { NewTransactionInput, SettlementInput } from "@/types/api";
import { appConfig } from "@/config/app";
import { http } from "@/lib/api/http";
import { mockDataApi } from "@/lib/api/mock/mockDataApi";

export const transactionsService = {
  list(): Promise<Transaction[]> {
    return appConfig.useMockApi ? mockDataApi.getTransactions() : http.get<Transaction[]>("/transactions");
  },
  create(payload: NewTransactionInput): Promise<Transaction> {
    return appConfig.useMockApi ? mockDataApi.createTransaction(payload) : http.post<Transaction>("/transactions", payload);
  },
  update(id: string, patch: Partial<Transaction>, ledgerMode: "STRICT" | "DIRECT"): Promise<Transaction> {
    return appConfig.useMockApi
      ? mockDataApi.updateTransaction(id, patch, ledgerMode)
      : http.patch<Transaction>(`/transactions/${id}`, { ...patch, ledgerMode });
  },
  remove(id: string, ledgerMode: "STRICT" | "DIRECT"): Promise<true> {
    return appConfig.useMockApi
      ? mockDataApi.deleteTransaction(id, ledgerMode)
      : http.delete<true>(`/transactions/${id}?ledgerMode=${ledgerMode}`);
  },
  settleFriend(args: SettlementInput): Promise<Transaction> {
    return appConfig.useMockApi ? mockDataApi.settleFriend(args) : http.post<Transaction>(`/friends/${args.friendId}/settle`, args);
  },
};
