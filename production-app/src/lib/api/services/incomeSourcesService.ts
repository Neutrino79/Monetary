/**
 * Income source endpoints. Real REST shape this stands in for:
 *   GET /income-sources
 */
import type { IncomeSource } from "@/types";
import { appConfig } from "@/config/app";
import { http } from "@/lib/api/http";
import { mockDataApi } from "@/lib/api/mock/mockDataApi";

export const incomeSourcesService = {
  list(): Promise<IncomeSource[]> {
    return appConfig.useMockApi ? mockDataApi.getIncomeSources() : http.get<IncomeSource[]>("/income-sources");
  },
};
