/** Wire -> domain for the Reports & Trends analysis endpoints (money in major units, display only). */
import type {
  BudgetHistory, CategoriesReport, CompareReport, Finding, ForecastPoint, Outlook, Overview,
} from "@/types";
import type { MoneyDto } from "@/types/api";
import { fromMoney } from "@/lib/api/mappers";

type M = MoneyDto;
interface MonthDto { year: number; month: number }

export interface OverviewDto {
  currency: string; months: number;
  points: (MonthDto & { isPartial: boolean; income: M; expense: M; net: M; savingsRate: number | null; rollingExpense: M; unusual: boolean; versusUsualPct: number | null })[];
  previousPoints: (MonthDto & { income: M; expense: M; net: M; savingsRate: number | null })[];
  current: TotalsDto; previous: TotalsDto;
  netWorth: (MonthDto & { assets: M; liabilities: M; netWorth: M })[];
  incomeSources: { categoryId: number | null; name: string; color: string | null; points: M[] }[];
  findings: FindingDto[];
}
interface TotalsDto { income: M; expense: M; net: M; savingsRate: number | null; averageIncome: M; averageExpense: M }
interface FindingDto {
  code: string; tone: "good" | "watch" | "neutral";
  rate?: number | null; previousRate?: number | null; goodMonths?: number | null; completeMonths?: number | null;
  flagged?: { year: number; month: number; pct: number | null }[] | null;
  name?: string | null; average?: M | null; coverPct?: number | null; fromAmount?: M | null; toAmount?: M | null; changePct?: number | null;
}

const totals = (t: TotalsDto) => ({
  income: fromMoney(t.income), expense: fromMoney(t.expense), net: fromMoney(t.net), savingsRate: t.savingsRate,
  averageIncome: fromMoney(t.averageIncome), averageExpense: fromMoney(t.averageExpense),
});

function toFinding(f: FindingDto): Finding | null {
  switch (f.code) {
    case "savings_rate":
      return { code: "savings_rate", tone: f.tone, rate: f.rate ?? 0, previousRate: f.previousRate ?? null, goodMonths: f.goodMonths ?? 0, completeMonths: f.completeMonths ?? 0 };
    case "unusual_months":
      return { code: "unusual_months", tone: f.tone, flagged: f.flagged ?? [] };
    case "main_income_cover":
      return { code: "main_income_cover", tone: f.tone, name: f.name ?? "", average: f.average ? fromMoney(f.average) : 0, coverPct: f.coverPct ?? 0 };
    case "debt_change":
      return { code: "debt_change", tone: f.tone, from: f.fromAmount ? fromMoney(f.fromAmount) : 0, to: f.toAmount ? fromMoney(f.toAmount) : 0, changePct: f.changePct ?? null };
    default:
      return null; // a finding a newer server knows and this client does not: skip it
  }
}

export function toOverview(d: OverviewDto): Overview {
  return {
    currency: d.currency, months: d.months,
    points: d.points.map((p) => ({
      year: p.year, month: p.month, isPartial: p.isPartial, income: fromMoney(p.income), expense: fromMoney(p.expense),
      net: fromMoney(p.net), savingsRate: p.savingsRate, rollingExpense: fromMoney(p.rollingExpense), unusual: p.unusual, versusUsualPct: p.versusUsualPct,
    })),
    previousPoints: d.previousPoints.map((p) => ({ year: p.year, month: p.month, income: fromMoney(p.income), expense: fromMoney(p.expense), net: fromMoney(p.net), savingsRate: p.savingsRate })),
    current: totals(d.current), previous: totals(d.previous),
    netWorth: d.netWorth.map((n) => ({ year: n.year, month: n.month, assets: fromMoney(n.assets), liabilities: fromMoney(n.liabilities), netWorth: fromMoney(n.netWorth) })),
    incomeSources: d.incomeSources.map((s) => ({ categoryId: s.categoryId, name: s.name, color: s.color, points: s.points.map(fromMoney) })),
    findings: d.findings.map(toFinding).filter((f): f is Finding => f !== null),
  };
}

export interface CategoriesReportDto {
  currency: string; kind: "spending" | "income"; months: number; seriesMonths: MonthDto[];
  categories: {
    categoryId: number; name: string; color: string | null; points: M[]; current: M;
    usual: { low: M; median: M; high: M } | null; state: "above" | "below" | "normal" | null; versusUsualPct: number | null;
    slope: M; average: M; previousAverage: M; changePct: number | null; sharePct: number;
  }[];
  total: { average: M; previousAverage: M; changePct: number | null };
}

export function toCategoriesReport(d: CategoriesReportDto): CategoriesReport {
  return {
    currency: d.currency, kind: d.kind, months: d.months, seriesMonths: d.seriesMonths,
    categories: d.categories.map((c) => ({
      categoryId: c.categoryId, name: c.name, color: c.color, points: c.points.map(fromMoney), current: fromMoney(c.current),
      usual: c.usual && { low: fromMoney(c.usual.low), median: fromMoney(c.usual.median), high: fromMoney(c.usual.high) },
      state: c.state, versusUsualPct: c.versusUsualPct, slope: fromMoney(c.slope), average: fromMoney(c.average),
      previousAverage: fromMoney(c.previousAverage), changePct: c.changePct, sharePct: c.sharePct,
    })),
    total: { average: fromMoney(d.total.average), previousAverage: fromMoney(d.total.previousAverage), changePct: d.total.changePct },
  };
}

export interface CompareReportDto {
  currency: string;
  a: { income: M; expense: M; kept: M }; b: { income: M; expense: M; kept: M };
  categories: {
    categoryId: number; name: string; color: string | null; a: M; b: M; change: M; changePct: number | null; shareOfChangePct: number;
    purchasesA: number; purchasesB: number; averagePurchaseA: M; averagePurchaseB: M; volumeEffect: M; ticketEffect: M;
  }[];
  volumeEffect: M; ticketEffect: M;
}

const side = (s: { income: M; expense: M; kept: M }) => ({ income: fromMoney(s.income), expense: fromMoney(s.expense), kept: fromMoney(s.kept) });

export function toCompare(d: CompareReportDto): CompareReport {
  return {
    currency: d.currency, a: side(d.a), b: side(d.b),
    categories: d.categories.map((c) => ({
      categoryId: c.categoryId, name: c.name, color: c.color, a: fromMoney(c.a), b: fromMoney(c.b), change: fromMoney(c.change),
      changePct: c.changePct, shareOfChangePct: c.shareOfChangePct, purchasesA: c.purchasesA, purchasesB: c.purchasesB,
      averagePurchaseA: fromMoney(c.averagePurchaseA), averagePurchaseB: fromMoney(c.averagePurchaseB),
      volumeEffect: fromMoney(c.volumeEffect), ticketEffect: fromMoney(c.ticketEffect),
    })),
    volumeEffect: fromMoney(d.volumeEffect), ticketEffect: fromMoney(d.ticketEffect),
  };
}

export interface BudgetHistoryDto {
  currency: string; months: number;
  budgets: {
    categoryId: number; name: string; color: string | null; limit: M; points: M[]; monthsOver: number; held: number;
    completeMonths: number; typicalPct: number; suggestion: { action: "keep" | "raise" | "tighten"; limit: M; recentOvershoot: M };
  }[];
  limitTotal: M; monthTotals: (MonthDto & { isPartial: boolean; spent: M })[];
  unbudgeted: { categoryId: number; name: string; color: string | null; average: M; peak: M; suggestion: { period: "month" | "year"; limit: M } }[];
  held: number; budgetMonths: number; coveragePct: number | null;
}

export function toBudgetHistory(d: BudgetHistoryDto): BudgetHistory {
  return {
    currency: d.currency, months: d.months,
    budgets: d.budgets.map((b) => ({
      categoryId: b.categoryId, name: b.name, color: b.color, limit: fromMoney(b.limit), points: b.points.map(fromMoney),
      monthsOver: b.monthsOver, held: b.held, completeMonths: b.completeMonths, typicalPct: b.typicalPct,
      suggestion: { action: b.suggestion.action, limit: fromMoney(b.suggestion.limit), recentOvershoot: fromMoney(b.suggestion.recentOvershoot) },
    })),
    limitTotal: fromMoney(d.limitTotal),
    monthTotals: d.monthTotals.map((t) => ({ year: t.year, month: t.month, isPartial: t.isPartial, spent: fromMoney(t.spent) })),
    unbudgeted: d.unbudgeted.map((u) => ({ categoryId: u.categoryId, name: u.name, color: u.color, average: fromMoney(u.average), peak: fromMoney(u.peak), suggestion: { period: u.suggestion.period, limit: fromMoney(u.suggestion.limit) } })),
    held: d.held, budgetMonths: d.budgetMonths, coveragePct: d.coveragePct,
  };
}

interface ForecastDto extends MonthDto { expected: M; low: M; high: M }
export interface OutlookDto {
  currency: string; months: number; learnedFrom: number; netWorthNow: M;
  history: (MonthDto & { netWorth: M })[]; method: "seasonal" | "average" | "none"; forecast: ForecastDto[];
  yearEnd: null | { year: number; netWorth: ForecastDto; income: M; expense: M; kept: M; savingsRate: number | null };
  typicalMonthlyKept: M;
  levers: { categoryId: number; name: string; limit: M; typical: M; monthlySaving: M }[];
}

const point = (f: ForecastDto): ForecastPoint => ({ year: f.year, month: f.month, expected: fromMoney(f.expected), low: fromMoney(f.low), high: fromMoney(f.high) });

export function toOutlook(d: OutlookDto): Outlook {
  return {
    currency: d.currency, months: d.months, learnedFrom: d.learnedFrom, netWorthNow: fromMoney(d.netWorthNow),
    history: d.history.map((h) => ({ year: h.year, month: h.month, netWorth: fromMoney(h.netWorth) })),
    method: d.method, forecast: d.forecast.map(point),
    yearEnd: d.yearEnd && { year: d.yearEnd.year, netWorth: point(d.yearEnd.netWorth), income: fromMoney(d.yearEnd.income), expense: fromMoney(d.yearEnd.expense), kept: fromMoney(d.yearEnd.kept), savingsRate: d.yearEnd.savingsRate },
    typicalMonthlyKept: fromMoney(d.typicalMonthlyKept),
    levers: d.levers.map((l) => ({ categoryId: l.categoryId, name: l.name, limit: fromMoney(l.limit), typical: fromMoney(l.typical), monthlySaving: fromMoney(l.monthlySaving) })),
  };
}
