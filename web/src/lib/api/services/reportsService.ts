import type { CashflowPoint, CategoryTotal, Dashboard, SpendingPace } from "@/types";
import { appConfig } from "@/config/app";
import { http } from "@/lib/api/http";
import { toCashflow, toCategoryTotal, toDashboard, toSpendingPace, type CashflowDto, type DashboardDto, type SpendingPaceDto } from "@/lib/api/mappers";

/** `month` is 'YYYY-MM'; omitted = the owner's current month (the backend takes it as one `month` param). */
const period = (month?: string) => (month ? { month } : undefined);

export const reportsService = {
  async dashboard(homeCurrency: string, month?: string): Promise<Dashboard> {
    return toDashboard(await http.get<DashboardDto>("/reports/dashboard", period(month)), homeCurrency);
  },

  async cashflow(months = 6): Promise<CashflowPoint[]> {
    return toCashflow(await http.get<CashflowDto>("/reports/trends/cashflow", { months }), appConfig.locale);
  },

  async spendingPace(month?: string): Promise<SpendingPace> {
    return toSpendingPace(await http.get<SpendingPaceDto>("/reports/spending-pace", period(month)));
  },

  async spending(month?: string): Promise<CategoryTotal[]> {
    const rows = await http.get<Parameters<typeof toCategoryTotal>[0][]>("/reports/spending", period(month));
    return rows.map(toCategoryTotal);
  },

  async income(month?: string): Promise<CategoryTotal[]> {
    const rows = await http.get<Parameters<typeof toCategoryTotal>[0][]>("/reports/income", period(month));
    return rows.map(toCategoryTotal);
  },
};
