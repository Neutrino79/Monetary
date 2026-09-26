from __future__ import annotations

from pydantic import BaseModel

from duevia.presentation.api.schemas.common import MoneyOut


class NetWorthOut(BaseModel):
    currency: str
    assets: MoneyOut
    liabilities: MoneyOut
    net_worth: MoneyOut


class BudgetStatusOut(BaseModel):
    category_id: int
    category_name: str
    year: int
    month: int
    budget: MoneyOut
    spent: MoneyOut
    remaining: MoneyOut
    percentage_used: float
    over_budget: bool


class CategoryTotalOut(BaseModel):
    category_id: int
    category_name: str
    total: MoneyOut
    year: int
    month: int


class DashboardOut(BaseModel):
    year: int
    month: int
    net_worth: list[NetWorthOut]
    account_balances: list[dict]
    budget_status: list[BudgetStatusOut]
    top_spending: list[CategoryTotalOut]
    income_summary: list[CategoryTotalOut]
    friend_balances: list[dict]


class ReferenceDataOut(BaseModel):
    """Everything a UI typically needs to populate dropdowns on first load, in
    one round trip instead of three separate calls."""
    accounts: list[dict]
    categories: list[dict]
    friends: list[dict]


class MonthPointOut(BaseModel):
    year: int
    month: int
    value: MoneyOut


class TrendOut(BaseModel):
    """A time series for charting -- one point per month, oldest first."""
    label: str
    currency: str
    points: list[MonthPointOut]


class CashflowPointOut(BaseModel):
    year: int
    month: int
    income: MoneyOut
    expense: MoneyOut
    net: MoneyOut


class CashflowTrendOut(BaseModel):
    currency: str
    points: list[CashflowPointOut]
