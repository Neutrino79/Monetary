from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from duevia.application import (
    account_service,
    budget_service,
    dashboard_service,
    statement_service,
    trends_service,
    user_service,
)
from duevia.domain.exceptions import ValidationError
from duevia.config import API_PREFIX
from duevia.presentation.api.deps import get_current_owner, get_db
from duevia.presentation.api.schemas.converters import money_out
from duevia.presentation.api.schemas.reports import (
    BudgetStatusOut,
    CashflowPointOut,
    CashflowTrendOut,
    CategoryTotalOut,
    DashboardOut,
    MonthPointOut,
    NetWorthOut,
    ReferenceDataOut,
    TrendOut,
)

router = APIRouter(prefix=f"{API_PREFIX}/reports", tags=["reports"])


def _year_month(month: str | None) -> tuple[int | None, int | None]:
    if not month:
        return None, None
    parts = month.split("-")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise ValidationError(f"Invalid month {month!r}; expected 'YYYY-MM', e.g. '2026-09'.")
    year, m = int(parts[0]), int(parts[1])
    if not (1 <= m <= 12):
        raise ValidationError(f"Invalid month {month!r}: month must be between 01 and 12.")
    return year, m


@router.get("/balance", response_model=list[dict])
def balance(
    include_inactive: bool = Query(default=False),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    rows = statement_service.account_balances(conn, include_inactive=include_inactive)
    return [{"account_id": r["account_id"], "name": r["name"], "account_type": r["account_type"],
             "is_active": r["is_active"], "balance": money_out(r["points"], r["currency"])} for r in rows]


@router.get("/budget", response_model=list[BudgetStatusOut])
def budget(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    rows = budget_service.budget_status(conn, owner, year=year, month=m)
    return [BudgetStatusOut(
        category_id=r["category_id"], category_name=r["category_name"], year=r["year"], month=r["month"],
        budget=money_out(r["budget"].points, r["currency"]), spent=money_out(r["spent"].points, r["currency"]),
        remaining=money_out(r["remaining_points"], r["currency"]), percentage_used=r["percentage_used"],
        over_budget=r["over_budget"],
    ) for r in rows]


@router.get("/net-worth", response_model=list[NetWorthOut])
def net_worth(conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner)):
    rows = dashboard_service.net_worth(conn)
    return [NetWorthOut(
        currency=r["currency"], assets=money_out(r["assets"], r["currency"]),
        liabilities=money_out(r["liabilities"], r["currency"]), net_worth=money_out(r["net_worth"], r["currency"]),
    ) for r in rows]


@router.get("/spending", response_model=list[CategoryTotalOut])
def spending(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    rows = dashboard_service.category_totals(conn, owner, "EXPENSE", year=year, month=m)
    return [CategoryTotalOut(category_id=r["category_id"], category_name=r["category_name"],
                              total=money_out(r["total_points"], r["currency"]),
                              year=r["year"], month=r["month"]) for r in rows]


@router.get("/income", response_model=list[CategoryTotalOut])
def income(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    rows = dashboard_service.category_totals(conn, owner, "INCOME", year=year, month=m)
    return [CategoryTotalOut(category_id=r["category_id"], category_name=r["category_name"],
                              total=money_out(r["total_points"], r["currency"]),
                              year=r["year"], month=r["month"]) for r in rows]


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    d = dashboard_service.dashboard(conn, owner, year=year, month=m)
    return DashboardOut(
        year=d["year"], month=d["month"],
        net_worth=[NetWorthOut(currency=r["currency"], assets=money_out(r["assets"], r["currency"]),
                                liabilities=money_out(r["liabilities"], r["currency"]),
                                net_worth=money_out(r["net_worth"], r["currency"])) for r in d["net_worth"]],
        account_balances=[{"account_id": r["account_id"], "name": r["name"],
                            "account_type": r["account_type"],
                            "balance": money_out(r["points"], r["currency"]).model_dump()}
                           for r in d["account_balances"]],
        budget_status=[BudgetStatusOut(
            category_id=r["category_id"], category_name=r["category_name"], year=r["year"], month=r["month"],
            budget=money_out(r["budget"].points, r["currency"]), spent=money_out(r["spent"].points, r["currency"]),
            remaining=money_out(r["remaining_points"], r["currency"]), percentage_used=r["percentage_used"],
            over_budget=r["over_budget"],
        ) for r in d["budget_status"]],
        top_spending=[CategoryTotalOut(category_id=r["category_id"], category_name=r["category_name"],
                                        total=money_out(r["total_points"], r["currency"]),
                                        year=r["year"], month=r["month"]) for r in d["top_spending"]],
        income_summary=[CategoryTotalOut(category_id=r["category_id"], category_name=r["category_name"],
                                          total=money_out(r["total_points"], r["currency"]),
                                          year=r["year"], month=r["month"]) for r in d["income_summary"]],
        friend_balances=[{"friend_id": r["friend_id"], "friend_name": r["friend_name"],
                           "balance": money_out(r["points"], r["currency"]).model_dump()}
                          for r in d["friend_balances"]],
    )


@router.get("/reference-data", response_model=ReferenceDataOut)
def reference_data(conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner)):
    """One round trip for everything a UI needs to populate dropdowns: active
    accounts, active categories, and friends. New endpoint -- the CLI never
    needed this since it never has to pre-populate a form."""
    accounts = account_service.list_accounts(conn)
    categories = account_service.list_categories(conn)
    friends = [{"id": f["id"], "name": f["name"], "email": f["email"]}
               for f in user_service.list_friends(conn)]
    return ReferenceDataOut(
        accounts=[{"id": a["id"], "name": a["name"], "account_type": a["account_type"],
                    "currency_code": a["currency_code"]} for a in accounts],
        categories=[{"id": c["id"], "name": c["name"], "account_type": c["account_type"],
                      "currency_code": c["currency_code"], "parent_account_id": c["parent_account_id"]}
                     for c in categories],
        friends=friends,
    )


@router.get("/trends/net-worth", response_model=list[TrendOut])
def net_worth_trend(
    months: int = Query(default=12, ge=1, le=60),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    series = trends_service.net_worth_trend(conn, owner, months=months)
    return [TrendOut(
        label="Net worth", currency=s["currency"],
        points=[MonthPointOut(year=p["year"], month=p["month"], value=money_out(p["points"], s["currency"]))
                for p in s["points"]],
    ) for s in series]


@router.get("/trends/spending", response_model=TrendOut)
def spending_trend(
    category_id: int,
    months: int = Query(default=12, ge=1, le=60),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    s = trends_service.category_spending_trend(conn, owner, category_id, months=months)
    return TrendOut(
        label=s["category_name"], currency=s["currency"],
        points=[MonthPointOut(year=p["year"], month=p["month"], value=money_out(p["points"], s["currency"]))
                for p in s["points"]],
    )


@router.get("/trends/cashflow", response_model=CashflowTrendOut)
def cashflow_trend(
    months: int = Query(default=12, ge=1, le=60),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    s = trends_service.cashflow_trend(conn, owner, months=months)
    return CashflowTrendOut(
        currency=s["currency"],
        points=[CashflowPointOut(
            year=p["year"], month=p["month"],
            income=money_out(p["income_points"], s["currency"]),
            expense=money_out(p["expense_points"], s["currency"]),
            net=money_out(p["net_points"], s["currency"]),
        ) for p in s["points"]],
    )
