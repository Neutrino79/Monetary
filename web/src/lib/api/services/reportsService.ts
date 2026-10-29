import type { BudgetHistory, CashflowPoint, CategoriesReport, CategoryTotal, CompareReport, Dashboard, MonthSpan, Outlook, Overview, SpendingPace } from "@/types";
import { appConfig } from "@/config/app";
import { http } from "@/lib/api/http";
import { toBudgetHistory, toCategoriesReport, toCompare, toOutlook, toOverview, type BudgetHistoryDto, type CategoriesReportDto, type CompareReportDto, type OutlookDto, type OverviewDto } from "@/lib/api/reportMappers";
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

  /** The Reports & Trends analysis. `months` is a window ending with the current month. */
  async overview(months: number): Promise<Overview> {
    return toOverview(await http.get<OverviewDto>("/reports/overview", { months }));
  },

  async categoriesReport(months: number, kind: "spending" | "income"): Promise<CategoriesReport> {
    return toCategoriesReport(await http.get<CategoriesReportDto>("/reports/categories", { months, kind }));
  },

  async compare(a: MonthSpan, b: MonthSpan): Promise<CompareReport> {
    return toCompare(await http.get<CompareReportDto>("/reports/compare", { aFrom: a.from, aTo: a.to, bFrom: b.from, bTo: b.to }));
  },

  async budgetHistory(months: number): Promise<BudgetHistory> {
    return toBudgetHistory(await http.get<BudgetHistoryDto>("/reports/budget-history", { months }));
  },

  async outlook(months: number): Promise<Outlook> {
    return toOutlook(await http.get<OutlookDto>("/reports/outlook", { months }));
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
