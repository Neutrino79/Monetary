"""Response shapes for the Reports & Trends analysis endpoints (overview, categories, compare,
budget history, outlook). Money is `MoneyOut`; percentages are plain numbers."""

from __future__ import annotations

from monetary.presentation.api.schemas.common import ApiModel, MoneyOut


class MonthRefOut(ApiModel):
    year: int
    month: int


# ---------------------------------------------------------------- overview ---
class OverviewMonthOut(ApiModel):
    year: int
    month: int
    is_partial: bool                      # the current month, still in progress
    income: MoneyOut
    expense: MoneyOut
    net: MoneyOut                         # what was kept
    savings_rate: float | None            # net as a percent of income; None with no income
    rolling_expense: MoneyOut             # trailing 3-month average of spending
    unusual: bool                         # well outside this window's normal spending
    versus_usual_pct: float | None        # how far from the window's average, when unusual


class EarlierMonthOut(ApiModel):
    year: int
    month: int
    income: MoneyOut
    expense: MoneyOut
    net: MoneyOut
    savings_rate: float | None


class PeriodTotalsOut(ApiModel):
    income: MoneyOut
    expense: MoneyOut
    net: MoneyOut
    savings_rate: float | None
    average_income: MoneyOut
    average_expense: MoneyOut


class NetWorthMonthOut(ApiModel):
    year: int
    month: int
    assets: MoneyOut
    liabilities: MoneyOut                 # what is owed on cards and loans
    net_worth: MoneyOut


class IncomeSourceOut(ApiModel):
    category_id: int | None               # None for the combined "Other income"
    name: str
    color: str | None
    points: list[MoneyOut]                # one per month of the window


class UnusualMonthOut(ApiModel):
    year: int
    month: int
    pct: float | None


class FindingOut(ApiModel):
    """One finding as a code plus the numbers behind it; the client words it. Which fields are set
    depends on `code`: savings_rate, unusual_months, main_income_cover, debt_change."""
    code: str
    tone: str                             # "good", "watch" or "neutral"
    rate: float | None = None
    previous_rate: float | None = None
    good_months: int | None = None
    complete_months: int | None = None
    flagged: list[UnusualMonthOut] | None = None
    name: str | None = None
    average: MoneyOut | None = None
    cover_pct: int | None = None
    from_amount: MoneyOut | None = None
    to_amount: MoneyOut | None = None
    change_pct: float | None = None


class OverviewOut(ApiModel):
    currency: str
    months: int
    points: list[OverviewMonthOut]
    previous_points: list[EarlierMonthOut]
    current: PeriodTotalsOut
    previous: PeriodTotalsOut
    net_worth: list[NetWorthMonthOut]
    income_sources: list[IncomeSourceOut]
    findings: list[FindingOut]


# -------------------------------------------------------------- categories ---
class UsualRangeOut(ApiModel):
    low: MoneyOut
    median: MoneyOut
    high: MoneyOut


class CategoryTrendOut(ApiModel):
    category_id: int
    name: str
    color: str | None
    points: list[MoneyOut]                # one per month in `series_months`
    current: MoneyOut                     # the latest (current, partial) month
    usual: UsualRangeOut | None           # None with too few earlier months
    state: str | None                     # "above", "below" or "normal" against the usual range
    versus_usual_pct: float | None
    slope: MoneyOut                       # least-squares change per month
    average: MoneyOut                     # monthly average over the window
    previous_average: MoneyOut            # monthly average over the window before it
    change_pct: float | None
    share_pct: float


class CategoriesTotalOut(ApiModel):
    average: MoneyOut
    previous_average: MoneyOut
    change_pct: float | None


class CategoriesReportOut(ApiModel):
    currency: str
    kind: str                             # "spending" or "income"
    months: int
    series_months: list[MonthRefOut]
    categories: list[CategoryTrendOut]
    total: CategoriesTotalOut


# ----------------------------------------------------------------- compare ---
class CompareSideOut(ApiModel):
    income: MoneyOut
    expense: MoneyOut
    kept: MoneyOut


class CompareCategoryOut(ApiModel):
    category_id: int
    name: str
    color: str | None
    a: MoneyOut
    b: MoneyOut
    change: MoneyOut                      # a - b
    change_pct: float | None
    share_of_change_pct: int              # this category's part of the sum of all absolute changes
    purchases_a: int
    purchases_b: int
    average_purchase_a: MoneyOut
    average_purchase_b: MoneyOut
    volume_effect: MoneyOut               # bought more or less often
    ticket_effect: MoneyOut               # paid more or less each time; volume + ticket == change


class CompareOut(ApiModel):
    currency: str
    a: CompareSideOut
    b: CompareSideOut
    categories: list[CompareCategoryOut]
    volume_effect: MoneyOut
    ticket_effect: MoneyOut


# ----------------------------------------------------------------- budgets ---
class BudgetSuggestionOut(ApiModel):
    action: str                           # "keep", "raise" or "tighten"
    limit: MoneyOut                       # the limit that would have fit
    recent_overshoot: MoneyOut            # how far the last months typically ran over the current limit


class BudgetHistoryRowOut(ApiModel):
    category_id: int
    name: str
    color: str | None
    limit: MoneyOut
    points: list[MoneyOut]                # spending per month, the last one still in progress
    months_over: int
    held: int
    complete_months: int
    typical_pct: float                    # the typical month as a percent of the limit
    suggestion: BudgetSuggestionOut


class MonthSpendOut(ApiModel):
    year: int
    month: int
    is_partial: bool
    spent: MoneyOut


class UnbudgetedSuggestionOut(ApiModel):
    period: str                           # "month", or "year" for lumpy spending
    limit: MoneyOut


class UnbudgetedOut(ApiModel):
    category_id: int
    name: str
    color: str | None
    average: MoneyOut
    peak: MoneyOut
    suggestion: UnbudgetedSuggestionOut


class BudgetHistoryOut(ApiModel):
    currency: str
    months: int
    budgets: list[BudgetHistoryRowOut]
    limit_total: MoneyOut
    month_totals: list[MonthSpendOut]
    unbudgeted: list[UnbudgetedOut]
    held: int                             # budget-months that stayed inside the limit ...
    budget_months: int                    # ... out of all complete budget-months
    coverage_pct: int | None              # share of spending that has a budget; None with no spending


# ----------------------------------------------------------------- outlook ---
class NetWorthPointOut(ApiModel):
    year: int
    month: int
    net_worth: MoneyOut


class ForecastPointOut(ApiModel):
    year: int
    month: int
    expected: MoneyOut
    low: MoneyOut
    high: MoneyOut


class YearEndOut(ApiModel):
    year: int
    net_worth: ForecastPointOut
    income: MoneyOut
    expense: MoneyOut
    kept: MoneyOut
    savings_rate: float | None


class LeverOut(ApiModel):
    category_id: int
    name: str
    limit: MoneyOut
    typical: MoneyOut
    monthly_saving: MoneyOut


class OutlookOut(ApiModel):
    currency: str
    months: int
    learned_from: int                     # complete months the projection learned from
    net_worth_now: MoneyOut
    history: list[NetWorthPointOut]
    method: str                           # "seasonal", "average" or "none" (too little history)
    forecast: list[ForecastPointOut]      # end of this month and the 11 after it
    year_end: YearEndOut | None
    typical_monthly_kept: MoneyOut
    levers: list[LeverOut]
