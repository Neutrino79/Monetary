"""Trends application service: time-series aggregations purely for charting.
None of this existed for the CLI (a terminal can't render a graph) -- this is
exactly the kind of "more than CLI had" capability a real UI needs.
"""

from __future__ import annotations

from monetary.domain.enums import AccountType
from monetary.domain.time_utils import month_bounds_utc_iso
from monetary.infrastructure import repositories as repo


def _last_n_months(tz_name, months: int) -> list[tuple[int, int]]:
    """[(year, month), ...] for the last `months` months, oldest first, ending
    with the current month."""
    from monetary.domain.time_utils import current_year_month
    year, month = current_year_month(tz_name)
    result = []
    for i in range(months - 1, -1, -1):
        y, m = year, month - i
        while m <= 0:
            m += 12
            y -= 1
        result.append((y, m))
    return result


def net_worth_trend(conn, owner, *, months: int = 12) -> list[dict]:
    """Net worth as of the END of each of the last N months, grouped by currency."""
    tz = owner["timezone"]
    accounts = repo.list_accounts(
        conn, account_types=(AccountType.ASSET.value, AccountType.LIABILITY.value),
        include_inactive=True,
    )
    by_currency: dict[str, list[dict]] = {}
    for year, month in _last_n_months(tz, months):
        _start, end_iso = month_bounds_utc_iso(tz, year, month)
        totals: dict[str, int] = {}
        for acc in accounts:
            cur = acc["currency_code"]
            normal_side = AccountType(acc["account_type"]).normal_side.value
            points = repo.account_balance_points_as_of(conn, acc["id"], normal_side, end_iso)
            sign = 1 if acc["account_type"] == AccountType.ASSET.value else -1
            totals[cur] = totals.get(cur, 0) + sign * points
        for cur, net_points in totals.items():
            by_currency.setdefault(cur, []).append({"year": year, "month": month, "points": net_points})
    return [{"currency": cur, "points": pts} for cur, pts in by_currency.items()]


def category_spending_trend(conn, owner, category_id: int, *, months: int = 12) -> dict:
    """Monthly spend for one root EXPENSE category (rolled up with children) over time."""
    tz = owner["timezone"]
    from monetary.application import account_service
    category = account_service.get_category_or_raise(conn, category_id)
    child_ids = repo.child_account_ids(conn, category_id)
    account_ids = [category_id] + child_ids

    points = []
    for year, month in _last_n_months(tz, months):
        start_iso, end_iso = month_bounds_utc_iso(tz, year, month)
        debit, credit = repo.account_period_debit_credit(conn, account_ids, start_iso, end_iso)
        points.append({"year": year, "month": month, "points": debit - credit})
    return {"category_id": category_id, "category_name": category["name"],
            "currency": category["currency_code"], "points": points}


def cashflow_trend(conn, owner, *, months: int = 12) -> dict:
    """Total income vs total expense per month, across every category -- the
    "money in vs money out" chart, not tied to any one category."""
    tz = owner["timezone"]
    currency = owner["home_currency_code"]
    points = []
    for year, month in _last_n_months(tz, months):
        start_iso, end_iso = month_bounds_utc_iso(tz, year, month)
        exp_debit, exp_credit = repo.total_debit_credit_for_account_type(
            conn, AccountType.EXPENSE.value, start_iso, end_iso
        )
        inc_debit, inc_credit = repo.total_debit_credit_for_account_type(
            conn, AccountType.INCOME.value, start_iso, end_iso
        )
        expense_points = exp_debit - exp_credit
        income_points = inc_credit - inc_debit
        points.append({
            "year": year, "month": month,
            "income_points": income_points, "expense_points": expense_points,
            "net_points": income_points - expense_points,
        })
    return {"currency": currency, "points": points}
