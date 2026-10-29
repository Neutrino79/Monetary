/** Domain shapes for the Reports & Trends analysis. Money is in major units (numbers) for display only;
 *  every figure, ranking and judgement ("above usual", "raise to") is computed by the backend. */

export interface MonthRef {
  year: number;
  month: number;
}

export interface OverviewMonth extends MonthRef {
  /** The current month, still in progress. */
  isPartial: boolean;
  income: number;
  expense: number;
  /** What was kept. */
  net: number;
  savingsRate: number | null;
  /** Trailing 3-month average of spending. */
  rollingExpense: number;
  unusual: boolean;
  versusUsualPct: number | null;
}

export interface EarlierMonth extends MonthRef {
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
}

export interface PeriodTotals {
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  averageIncome: number;
  averageExpense: number;
}

export interface NetWorthMonth extends MonthRef {
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface IncomeMixSource {
  categoryId: number | null;
  name: string;
  color: string | null;
  points: number[];
}

export type Tone = "good" | "watch" | "neutral";

export type Finding =
  | { code: "savings_rate"; tone: Tone; rate: number; previousRate: number | null; goodMonths: number; completeMonths: number }
  | { code: "unusual_months"; tone: Tone; flagged: { year: number; month: number; pct: number | null }[] }
  | { code: "main_income_cover"; tone: Tone; name: string; average: number; coverPct: number }
  | { code: "debt_change"; tone: Tone; from: number; to: number; changePct: number | null };

export interface Overview {
  currency: string;
  months: number;
  points: OverviewMonth[];
  previousPoints: EarlierMonth[];
  current: PeriodTotals;
  previous: PeriodTotals;
  netWorth: NetWorthMonth[];
  incomeSources: IncomeMixSource[];
  findings: Finding[];
}

export type CategoryState = "above" | "below" | "normal";

export interface CategoryTrend {
  categoryId: number;
  name: string;
  color: string | null;
  points: number[];
  current: number;
  usual: { low: number; median: number; high: number } | null;
  state: CategoryState | null;
  versusUsualPct: number | null;
  /** Least-squares change per month. */
  slope: number;
  average: number;
  previousAverage: number;
  changePct: number | null;
  sharePct: number;
}

export interface CategoriesReport {
  currency: string;
  kind: "spending" | "income";
  months: number;
  seriesMonths: MonthRef[];
  categories: CategoryTrend[];
  total: { average: number; previousAverage: number; changePct: number | null };
}

export interface CompareSide {
  income: number;
  expense: number;
  kept: number;
}

export interface CompareCategory {
  categoryId: number;
  name: string;
  color: string | null;
  a: number;
  b: number;
  change: number;
  changePct: number | null;
  shareOfChangePct: number;
  purchasesA: number;
  purchasesB: number;
  averagePurchaseA: number;
  averagePurchaseB: number;
  /** Bought more or less often. */
  volumeEffect: number;
  /** Paid more or less each time; volume + ticket = change. */
  ticketEffect: number;
}

export interface CompareReport {
  currency: string;
  a: CompareSide;
  b: CompareSide;
  categories: CompareCategory[];
  volumeEffect: number;
  ticketEffect: number;
}

/** A period of whole months, 'YYYY-MM' to 'YYYY-MM'. */
export interface MonthSpan {
  from: string;
  to: string;
}

export interface BudgetHistoryRow {
  categoryId: number;
  name: string;
  color: string | null;
  limit: number;
  points: number[];
  monthsOver: number;
  held: number;
  completeMonths: number;
  typicalPct: number;
  suggestion: { action: "keep" | "raise" | "tighten"; limit: number; recentOvershoot: number };
}

export interface UnbudgetedCategory {
  categoryId: number;
  name: string;
  color: string | null;
  average: number;
  peak: number;
  suggestion: { period: "month" | "year"; limit: number };
}

export interface BudgetHistory {
  currency: string;
  months: number;
  budgets: BudgetHistoryRow[];
  limitTotal: number;
  monthTotals: (MonthRef & { isPartial: boolean; spent: number })[];
  unbudgeted: UnbudgetedCategory[];
  held: number;
  budgetMonths: number;
  coveragePct: number | null;
}

export interface ForecastPoint extends MonthRef {
  expected: number;
  low: number;
  high: number;
}

export interface Outlook {
  currency: string;
  months: number;
  learnedFrom: number;
  netWorthNow: number;
  history: (MonthRef & { netWorth: number })[];
  method: "seasonal" | "average" | "none";
  forecast: ForecastPoint[];
  yearEnd: null | { year: number; netWorth: ForecastPoint; income: number; expense: number; kept: number; savingsRate: number | null };
  typicalMonthlyKept: number;
  levers: { categoryId: number; name: string; limit: number; typical: number; monthlySaving: number }[];
}
