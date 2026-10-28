from __future__ import annotations


from monetary.presentation.api.schemas.common import ApiModel, MoneyOut
from monetary.presentation.api.schemas.friends import FriendBalanceOut


class NetWorthOut(ApiModel):
    currency: str
    assets: MoneyOut
    liabilities: MoneyOut
    net_worth: MoneyOut


class BudgetStatusOut(ApiModel):
    category_id: int
    category_name: str
    year: int
    month: int
    budget: MoneyOut
    spent: MoneyOut
    remaining: MoneyOut
    percentage_used: float
    over_budget: bool
    not_paid_back: MoneyOut  # friend-fronted spend this month that you have not repaid yet


class CategoryChildTotalOut(ApiModel):
    category_id: int
    category_name: str
    total: MoneyOut


class CategoryTotalOut(ApiModel):
    """A root category's period total, subcategories already rolled in;
    `children` is the per-subcategory breakdown of that same total."""
    category_id: int
    category_name: str
    total: MoneyOut
    year: int
    month: int
    children: list[CategoryChildTotalOut] = []


class AccountBalanceRowOut(ApiModel):
    account_id: int
    name: str
    account_type: str
    is_active: bool
    balance: MoneyOut


class PeriodSummaryOut(ApiModel):
    """Income / spending / savings for the month, in one currency."""
    currency: str
    income: MoneyOut
    expense: MoneyOut
    savings: MoneyOut


class FriendTotalsOut(ApiModel):
    currency: str
    owed_to_you: MoneyOut
    you_owe: MoneyOut


class DashboardOut(ApiModel):
    year: int
    month: int
    net_worth: list[NetWorthOut]
    summary: list[PeriodSummaryOut]
    account_balances: list[AccountBalanceRowOut]
    budget_status: list[BudgetStatusOut]
    top_spending: list[CategoryTotalOut]
    income_summary: list[CategoryTotalOut]
    friend_balances: list[FriendBalanceOut]
    friend_totals: list[FriendTotalsOut]


class ReferenceAccountOut(ApiModel):
    id: int
    name: str
    account_type: str
    currency_code: str


class ReferenceCategoryOut(ApiModel):
    id: int
    name: str
    account_type: str
    currency_code: str
    parent_id: int | None


class ReferenceFriendOut(ApiModel):
    id: int
    name: str
    email: str


class ReferenceDataOut(ApiModel):
    """Everything a UI typically needs to populate dropdowns on first load, in
    one round trip instead of three separate calls."""
    accounts: list[ReferenceAccountOut]
    categories: list[ReferenceCategoryOut]
    friends: list[ReferenceFriendOut]


class MonthPointOut(ApiModel):
    year: int
    month: int
    value: MoneyOut


class TrendOut(ApiModel):
    """A time series for charting -- one point per month, oldest first."""
    label: str
    currency: str
    points: list[MonthPointOut]


class CashflowPointOut(ApiModel):
    year: int
    month: int
    income: MoneyOut
    expense: MoneyOut
    net: MoneyOut


class CashflowTrendOut(ApiModel):
    currency: str
    points: list[CashflowPointOut]


class PaceDayOut(ApiModel):
    day: int
    spent: MoneyOut          # what was spent that day
    cumulative: MoneyOut     # spent so far this month, up to and including that day


class PaceComparisonOut(ApiModel):
    year: int
    month: int
    cumulative: list[MoneyOut]   # the whole earlier month, one entry per day


class PaceProjectionDayOut(ApiModel):
    day: int
    expected: MoneyOut
    low: MoneyOut
    high: MoneyOut


class PaceProjectionOut(ApiModel):
    method: str                  # "history": learned from earlier months; "pace": a plain daily-average line
    basis_months: int
    expected: MoneyOut           # where the month is expected to end
    low: MoneyOut
    high: MoneyOut
    days: list[PaceProjectionDayOut]   # from the day after today to the last day of the month


class SpendingPaceOut(ApiModel):
    currency: str
    year: int
    month: int
    days_in_month: int
    elapsed_days: int            # days that count: today for the current month, all of them for a past one
    is_current_month: bool
    days: list[PaceDayOut]
    previous: PaceComparisonOut
    budget_total: MoneyOut | None   # the sum of every category budget; None when none are set
    projection: PaceProjectionOut | None   # current month only, and only once there is enough to go on
