/**
 * Account endpoints. Real REST shape this stands in for:
 *   GET    /accounts
 *   POST   /accounts
 *   PATCH  /accounts/:id
 *   POST   /accounts/:id/archive
 *   POST   /accounts/:id/restore
 */
import type { Account } from "@/types";
import type { NewAccountInput } from "@/types/api";
import { appConfig } from "@/config/app";
import { http } from "@/lib/api/http";
import { mockDataApi } from "@/lib/api/mock/mockDataApi";

export const accountsService = {
  list(): Promise<Account[]> {
    return appConfig.useMockApi ? mockDataApi.getAccounts() : http.get<Account[]>("/accounts");
  },
  create(payload: NewAccountInput): Promise<Account> {
    return appConfig.useMockApi ? mockDataApi.createAccount(payload) : http.post<Account>("/accounts", payload);
  },
  update(id: string, patch: Partial<Account>): Promise<Account> {
    return appConfig.useMockApi ? mockDataApi.updateAccount(id, patch) : http.patch<Account>(`/accounts/${id}`, patch);
  },
  archive(id: string): Promise<Account> {
    return appConfig.useMockApi ? mockDataApi.archiveAccount(id) : http.post<Account>(`/accounts/${id}/archive`);
  },
  restore(id: string): Promise<Account> {
    return appConfig.useMockApi ? mockDataApi.restoreAccount(id) : http.post<Account>(`/accounts/${id}/restore`);
  },
};
