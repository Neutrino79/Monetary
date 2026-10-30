from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from monetary.application import (
    account_service,
    budget_service,
    dashboard_service,
    reports_service,
    statement_service,
    trends_service,
    user_service,
)
from monetary.domain.exceptions import ValidationError
from monetary.config import API_PREFIX
from monetary.presentation.api.deps import get_current_owner, DB
from monetary.presentation.api.schemas.converters import (
    account_balance_row_out,
    budget_status_out,
    category_total_out,
    friend_balance_out,
    money_out,
    net_worth_out,
)
from monetary.presentation.api.schemas import report_analysis as ra_out
from monetary.presentation.api.schemas.reports import (
    AccountBalanceRowOut,
    BudgetStatusOut,
    CashflowPointOut,
    CashflowTrendOut,
    CategoryTotalOut,
    DashboardOut,
    FriendTotalsOut,
    MonthPointOut,
    NetWorthOut,
    PaceComparisonOut,
    PaceDayOut,
    PaceProjectionDayOut,
    PaceProjectionOut,
    PeriodSummaryOut,
    ReferenceAccountOut,
    ReferenceCategoryOut,
    ReferenceDataOut,
    ReferenceFriendOut,
    SpendingPaceOut,
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
    if not (1900 <= year <= 2200):
        raise ValidationError(f"Invalid month {month!r}: year must be between 1900 and 2200.")
    return year, m


@router.get("/balance", response_model=list[AccountBalanceRowOut])
def balance(
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    rows = statement_service.account_balances(conn, include_inactive=include_inactive)
    return [account_balance_row_out(r) for r in rows]


@router.get("/budget", response_model=list[BudgetStatusOut])
def budget(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    rows = budget_service.budget_status(conn, owner, year=year, month=m)
    return [budget_status_out(r) for r in rows]


@router.get("/net-worth", response_model=list[NetWorthOut])
def net_worth(conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    rows = dashboard_service.net_worth(conn)
    return [net_worth_out(r) for r in rows]


@router.get("/spending", response_model=list[CategoryTotalOut])
def spending(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    rows = dashboard_service.category_totals(conn, owner, "EXPENSE", year=year, month=m)
    return [category_total_out(r) for r in rows]


@router.get("/income", response_model=list[CategoryTotalOut])
def income(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    rows = dashboard_service.category_totals(conn, owner, "INCOME", year=year, month=m)
    return [category_total_out(r) for r in rows]


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    d = dashboard_service.dashboard(conn, owner, year=year, month=m)
    return DashboardOut(
        year=d["year"], month=d["month"],
        net_worth=[net_worth_out(r) for r in d["net_worth"]],
        summary=[PeriodSummaryOut(currency=r["currency"], income=money_out(r["income_points"], r["currency"]),
                                  expense=money_out(r["expense_points"], r["currency"]),
                                  savings=money_out(r["savings_points"], r["currency"])) for r in d["summary"]],
        account_balances=[account_balance_row_out(r) for r in d["account_balances"]],
        budget_status=[budget_status_out(r) for r in d["budget_status"]],
        top_spending=[category_total_out(r) for r in d["top_spending"]],
        income_summary=[category_total_out(r) for r in d["income_summary"]],
        friend_balances=[friend_balance_out(r) for r in d["friend_balances"]],
        friend_totals=[FriendTotalsOut(currency=r["currency"],
                                       owed_to_you=money_out(r["owed_to_you_points"], r["currency"]),
                                       you_owe=money_out(r["you_owe_points"], r["currency"]))
                       for r in d["friend_totals"]],
    )


@router.get("/spending-pace", response_model=SpendingPaceOut)
def spending_pace(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$", description="'YYYY-MM', e.g. '2026-09'"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    year, m = _year_month(month)
    d = dashboard_service.spending_pace(conn, owner, year=year, month=m)
    cur = d["currency"]
    proj = d["projection"]
    return SpendingPaceOut(
        currency=cur, year=d["year"], month=d["month"], days_in_month=d["days_in_month"],
        elapsed_days=d["elapsed_days"], is_current_month=d["is_current_month"],
        days=[PaceDayOut(day=r["day"], spent=money_out(r["spent_points"], cur),
                         cumulative=money_out(r["cumulative_points"], cur)) for r in d["days"]],
        previous=PaceComparisonOut(year=d["previous"]["year"], month=d["previous"]["month"],
                                   cumulative=[money_out(p, cur) for p in d["previous"]["cumulative_points"]]),
        budget_total=money_out(d["budget_total_points"], cur) if d["budget_total_points"] is not None else None,
        projection=None if proj is None else PaceProjectionOut(
            method=proj.method, basis_months=proj.basis_months,
            expected=money_out(proj.end.expected, cur), low=money_out(proj.end.low, cur),
            high=money_out(proj.end.high, cur),
            days=[PaceProjectionDayOut(day=x.day, expected=money_out(x.expected, cur),
                                       low=money_out(x.low, cur), high=money_out(x.high, cur)) for x in proj.days],
        ),
    )


@router.get("/reference-data", response_model=ReferenceDataOut)
def reference_data(conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    """One round trip for everything a UI needs to populate dropdowns: active
    accounts, active categories, and friends. New endpoint -- the CLI never
    needed this since it never has to pre-populate a form."""
    accounts = account_service.list_accounts(conn)
    categories = account_service.list_categories(conn)
    friends = user_service.list_friends(conn)
    return ReferenceDataOut(
        accounts=[ReferenceAccountOut(id=a["id"], name=a["name"], account_type=a["account_type"],
                                      currency_code=a["currency_code"]) for a in accounts],
        categories=[ReferenceCategoryOut(id=c["id"], name=c["name"], account_type=c["account_type"],
                                         currency_code=c["currency_code"], parent_id=c["parent_account_id"])
                    for c in categories],
        friends=[ReferenceFriendOut(id=f["id"], name=f["name"], email=f["email"]) for f in friends],
    )


@router.get("/trends/net-worth", response_model=list[TrendOut])
def net_worth_trend(
    months: int = Query(default=12, ge=1, le=60),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
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
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
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
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
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


# ------------------------------------------------- Reports & Trends analysis ---
def _span(first: str, last: str, label: str):
    """Two 'YYYY-MM' strings -> ((year, month), (year, month)), first <= last, at most 36 months."""
    (fy, fm), (ly, lm) = _year_month(first), _year_month(last)
    start, end = (fy, fm), (ly, lm)
    if end < start:
        raise ValidationError(f"Period {label}: the end month is before the start month.")
    if (ly * 12 + lm) - (fy * 12 + fm) >= 36:
        raise ValidationError(f"Period {label} is longer than 36 months.")
    return start, end


@router.get("/overview", response_model=ra_out.OverviewOut)
def overview(
    months: int = Query(default=12, ge=1, le=36, description="Window length, ending with the current month"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    d = reports_service.overview(conn, owner, months=months)
    m = lambda p: money_out(p, d["currency"])  # noqa: E731
    mt = lambda t: ra_out.PeriodTotalsOut(  # noqa: E731
        income=m(t["income"]), expense=m(t["expense"]), net=m(t["net"]), savings_rate=t["savings_rate"],
        average_income=m(t["average_income"]), average_expense=m(t["average_expense"]))

    def finding(f: dict) -> ra_out.FindingOut:
        extra: dict = {}
        if f["code"] == "unusual_months":
            extra["flagged"] = [ra_out.UnusualMonthOut(**x) for x in f["flagged"]]
        else:
            extra = {k: v for k, v in f.items() if k not in ("code", "tone", "average", "from_points", "to_points")}
        if "average" in f:
            extra["average"] = m(f["average"])
        if "from_points" in f:
            extra["from_amount"], extra["to_amount"] = m(f["from_points"]), m(f["to_points"])
        return ra_out.FindingOut(code=f["code"], tone=f["tone"], **extra)

    return ra_out.OverviewOut(
        currency=d["currency"], months=d["months"],
        points=[ra_out.OverviewMonthOut(
            year=p["year"], month=p["month"], is_partial=p["is_partial"], income=m(p["income"]),
            expense=m(p["expense"]), net=m(p["net"]), savings_rate=p["savings_rate"],
            rolling_expense=m(p["rolling_expense"]), unusual=p["unusual"], versus_usual_pct=p["versus_usual_pct"],
        ) for p in d["points"]],
        previous_points=[ra_out.EarlierMonthOut(
            year=p["year"], month=p["month"], income=m(p["income"]), expense=m(p["expense"]), net=m(p["net"]),
            savings_rate=p["savings_rate"]) for p in d["previous_points"]],
        current=mt(d["current"]), previous=mt(d["previous"]),
        net_worth=[ra_out.NetWorthMonthOut(year=n["year"], month=n["month"], assets=m(n["assets"]),
                                           liabilities=m(n["liabilities"]), net_worth=m(n["net_worth"]))
                   for n in d["net_worth"]],
        income_sources=[ra_out.IncomeSourceOut(category_id=s["category_id"], name=s["name"], color=s["color"],
                                               points=[m(p) for p in s["points"]]) for s in d["income_sources"]],
        findings=[finding(f) for f in d["findings"]],
    )


@router.get("/categories", response_model=ra_out.CategoriesReportOut)
def categories_report(
    months: int = Query(default=12, ge=1, le=36),
    kind: str = Query(default="spending", pattern=r"^(spending|income)$"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    d = reports_service.categories(conn, owner, months=months, kind=kind)
    m = lambda p: money_out(p, d["currency"])  # noqa: E731
    return ra_out.CategoriesReportOut(
        currency=d["currency"], kind=d["kind"], months=d["months"],
        series_months=[ra_out.MonthRefOut(**x) for x in d["series_months"]],
        categories=[ra_out.CategoryTrendOut(
            category_id=c["category_id"], name=c["name"], color=c["color"],
            points=[m(p) for p in c["points"]], current=m(c["current"]),
            usual=None if c["usual"] is None else ra_out.UsualRangeOut(
                low=m(c["usual"]["low"]), median=m(c["usual"]["median"]), high=m(c["usual"]["high"])),
            state=c["state"], versus_usual_pct=c["versus_usual_pct"], slope=m(c["slope"]),
            average=m(c["average"]), previous_average=m(c["previous_average"]),
            change_pct=c["change_pct"], share_pct=c["share_pct"],
        ) for c in d["categories"]],
        total=ra_out.CategoriesTotalOut(
            average=m(d["total"]["average"]), previous_average=m(d["total"]["previous_average"]),
            change_pct=d["total"]["change_pct"]),
    )


@router.get("/compare", response_model=ra_out.CompareOut)
def compare_report(
    a_from: str = Query(alias="aFrom", pattern=r"^\d{4}-\d{2}$", description="Period A, first month 'YYYY-MM'"),
    a_to: str = Query(alias="aTo", pattern=r"^\d{4}-\d{2}$", description="Period A, last month"),
    b_from: str = Query(alias="bFrom", pattern=r"^\d{4}-\d{2}$", description="Period B (the one A is compared against)"),
    b_to: str = Query(alias="bTo", pattern=r"^\d{4}-\d{2}$"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    d = reports_service.compare(conn, owner, a=_span(a_from, a_to, "A"), b=_span(b_from, b_to, "B"))
    m = lambda p: money_out(p, d["currency"])  # noqa: E731
    side = lambda s: ra_out.CompareSideOut(income=m(s["income"]), expense=m(s["expense"]), kept=m(s["kept"]))  # noqa: E731
    return ra_out.CompareOut(
        currency=d["currency"], a=side(d["a"]), b=side(d["b"]),
        categories=[ra_out.CompareCategoryOut(
            category_id=c["category_id"], name=c["name"], color=c["color"], a=m(c["a"]), b=m(c["b"]),
            change=m(c["change"]), change_pct=c["change_pct"], share_of_change_pct=c["share_of_change_pct"],
            purchases_a=c["purchases_a"], purchases_b=c["purchases_b"],
            average_purchase_a=m(c["average_purchase_a"]), average_purchase_b=m(c["average_purchase_b"]),
            volume_effect=m(c["volume_effect"]), ticket_effect=m(c["ticket_effect"]),
        ) for c in d["categories"]],
        volume_effect=m(d["volume_effect"]), ticket_effect=m(d["ticket_effect"]),
    )


@router.get("/budget-history", response_model=ra_out.BudgetHistoryOut)
def budget_history(
    months: int = Query(default=12, ge=1, le=36),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    d = reports_service.budget_history(conn, owner, months=months)
    m = lambda p: money_out(p, d["currency"])  # noqa: E731
    return ra_out.BudgetHistoryOut(
        currency=d["currency"], months=d["months"],
        budgets=[ra_out.BudgetHistoryRowOut(
            category_id=b["category_id"], name=b["name"], color=b["color"], limit=m(b["limit"]),
            points=[m(p) for p in b["points"]], months_over=b["months_over"], held=b["held"],
            complete_months=b["complete_months"], typical_pct=b["typical_pct"],
            suggestion=ra_out.BudgetSuggestionOut(
                action=b["suggestion"]["action"], limit=m(b["suggestion"]["limit"]),
                recent_overshoot=m(b["suggestion"]["recent_overshoot"])),
        ) for b in d["budgets"]],
        limit_total=m(d["limit_total"]),
        month_totals=[ra_out.MonthSpendOut(year=t["year"], month=t["month"], is_partial=t["is_partial"],
                                           spent=m(t["spent"])) for t in d["month_totals"]],
        unbudgeted=[ra_out.UnbudgetedOut(
            category_id=u["category_id"], name=u["name"], color=u["color"], average=m(u["average"]),
            peak=m(u["peak"]), suggestion=ra_out.UnbudgetedSuggestionOut(
                period=u["suggestion"]["period"], limit=m(u["suggestion"]["limit"])),
        ) for u in d["unbudgeted"]],
        held=d["held"], budget_months=d["budget_months"], coverage_pct=d["coverage_pct"],
    )


@router.get("/outlook", response_model=ra_out.OutlookOut)
def outlook(
    months: int = Query(default=12, ge=1, le=36, description="How many complete months to learn from"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    d = reports_service.outlook(conn, owner, months=months)
    m = lambda p: money_out(p, d["currency"])  # noqa: E731
    point = lambda f: ra_out.ForecastPointOut(  # noqa: E731
        year=f["year"], month=f["month"], expected=m(f["expected"]), low=m(f["low"]), high=m(f["high"]))
    ye = d["year_end"]
    return ra_out.OutlookOut(
        currency=d["currency"], months=d["months"], learned_from=d["learned_from"],
        net_worth_now=m(d["net_worth_now"]),
        history=[ra_out.NetWorthPointOut(year=h["year"], month=h["month"], net_worth=m(h["net_worth"]))
                 for h in d["history"]],
        method=d["method"], forecast=[point(f) for f in d["forecast"]],
        year_end=None if ye is None else ra_out.YearEndOut(
            year=ye["year"], net_worth=point(ye["net_worth"]), income=m(ye["income"]), expense=m(ye["expense"]),
            kept=m(ye["kept"]), savings_rate=ye["savings_rate"]),
        typical_monthly_kept=m(d["typical_monthly_kept"]),
        levers=[ra_out.LeverOut(category_id=l["category_id"], name=l["name"], limit=m(l["limit"]),
                                typical=m(l["typical"]), monthly_saving=m(l["monthly_saving"]))
                for l in d["levers"]],
    )
