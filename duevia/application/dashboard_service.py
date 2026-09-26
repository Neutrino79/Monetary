"""Dashboard/reporting application service. Read-only, combines account
balances, net worth, category spend/income (all categories, not just budgeted
ones), budget status, and friend balances into one view.
"""

from __future__ import annotations

from duevia.domain.enums import AccountType
from duevia.domain.time_utils import current_year_month, month_bounds_utc_iso
from duevia.infrastructure import repositories as repo


def net_worth(conn) -> list[dict]:
    """Grouped by currency: total assets, total liabilities, net worth."""
    accounts = repo.list_accounts(
        conn, account_types=(AccountType.ASSET.value, AccountType.LIABILITY.value)
    )
    by_currency: dict[str, dict] = {}
    for acc in accounts:
        cur = acc["currency_code"]
        bucket = by_currency.setdefault(cur, {"currency": cur, "assets": 0, "liabilities": 0})
        normal_side = AccountType(acc["account_type"]).normal_side.value
        points = repo.account_balance_points(conn, acc["id"], normal_side)
        if acc["account_type"] == AccountType.ASSET.value:
            bucket["assets"] += points
        else:
            bucket["liabilities"] += points
    results = []
    for bucket in by_currency.values():
        bucket["net_worth"] = bucket["assets"] - bucket["liabilities"]
        results.append(bucket)
    return results


def category_totals(conn, owner, account_type: str, *, year=None, month=None) -> list[dict]:
    """Every active root category of the given type (EXPENSE or INCOME), with its
    actual period total -- unlike budget_status, this includes categories with
    no budget_limit set at all."""
    tz = owner["timezone"]
    if year is None or month is None:
        year, month = current_year_month(tz)
    start_iso, end_iso = month_bounds_utc_iso(tz, year, month)
    normal_side = AccountType(account_type).normal_side.value

    results = []
    for root in repo.all_root_categories(conn, account_type):
        child_ids = repo.child_account_ids(conn, root["id"])
        account_ids = [root["id"]] + child_ids
        debit, credit = repo.account_period_debit_credit(conn, account_ids, start_iso, end_iso)
        total_points = (debit - credit) if normal_side == "DEBIT" else (credit - debit)
        results.append({
            "category_id": root["id"], "category_name": root["name"],
            "currency": root["currency_code"], "total_points": total_points,
            "year": year, "month": month,
        })
    results.sort(key=lambda r: r["total_points"], reverse=True)
    return results


def dashboard(conn, owner, *, year=None, month=None) -> dict:
    from duevia.application import budget_service, statement_service

    tz = owner["timezone"]
    if year is None or month is None:
        year, month = current_year_month(tz)

    return {
        "year": year,
        "month": month,
        "net_worth": net_worth(conn),
        "account_balances": statement_service.account_balances(conn),
        "budget_status": budget_service.budget_status(conn, owner, year=year, month=month),
        "top_spending": category_totals(conn, owner, AccountType.EXPENSE.value, year=year, month=month)[:5],
        "income_summary": category_totals(conn, owner, AccountType.INCOME.value, year=year, month=month),
        "friend_balances": statement_service.friend_balances(conn),
    }
