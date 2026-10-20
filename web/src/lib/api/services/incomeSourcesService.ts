import type { IncomeSource } from "@/types";
import { categoriesService } from "./categoriesService";

/** Income sources are INCOME-type categories on the backend. */
export const incomeSourcesService = {
  list(): Promise<IncomeSource[]> {
    return categoriesService.list("INCOME");
  },
};
