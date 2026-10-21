"""Dashboard/reporting application service. Read-only, combines account
balances, net worth, category spend/income (all categories, not just budgeted
ones), budget status, and friend balances into one view.
"""

from __future__ import annotations

from monetary.domain.enums import AccountType
from monetary.domain.time_utils import current_year_month, month_bounds_utc_iso
from monetary.infrastructure import repositories as repo


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
        children = []
        for child_id in child_ids:
            child = repo.get_account(conn, child_id)
            if not child["is_active"]:
                continue
            c_debit, c_credit = repo.account_period_debit_credit(conn, [child_id], start_iso, end_iso)
            children.append({
                "category_id": child_id, "category_name": child["name"],
                "total_points": (c_debit - c_credit) if normal_side == "DEBIT" else (c_credit - c_debit),
            })
        children.sort(key=lambda c: c["total_points"], reverse=True)
        results.append({
            "category_id": root["id"], "category_name": root["name"],
            "currency": root["currency_code"], "total_points": total_points,
            "year": year, "month": month, "children": children,
        })
    results.sort(key=lambda r: r["total_points"], reverse=True)
    return results


def period_summary(spending: list[dict], income: list[dict]) -> list[dict]:
    """Income / spending / savings for the period, per currency. The category
    totals are root categories with their subcategories already rolled in, so
    summing them counts each posting once."""
    by_cur: dict[str, dict] = {}
    for rows, key in ((income, "income_points"), (spending, "expense_points")):
        for r in rows:
            b = by_cur.setdefault(r["currency"], {"currency": r["currency"], "income_points": 0, "expense_points": 0})
            b[key] += r["total_points"]
    out = list(by_cur.values())
    for b in out:
        b["savings_points"] = b["income_points"] - b["expense_points"]
    return out


def friend_totals(friend_rows: list[dict]) -> list[dict]:
    """What friends owe you in total vs. what you owe them, per currency."""
    by_cur: dict[str, dict] = {}
    for r in friend_rows:
        b = by_cur.setdefault(r["currency"], {"currency": r["currency"], "owed_to_you_points": 0, "you_owe_points": 0})
        if r["points"] > 0:
            b["owed_to_you_points"] += r["points"]
        else:
            b["you_owe_points"] += -r["points"]
    return list(by_cur.values())


def dashboard(conn, owner, *, year=None, month=None) -> dict:
    from monetary.application import budget_service, statement_service

    tz = owner["timezone"]
    if year is None or month is None:
        year, month = current_year_month(tz)

    spending = category_totals(conn, owner, AccountType.EXPENSE.value, year=year, month=month)
    income = category_totals(conn, owner, AccountType.INCOME.value, year=year, month=month)
    friends = statement_service.friend_balances(conn)
    return {
        "year": year,
        "month": month,
        "net_worth": net_worth(conn),
        "account_balances": statement_service.account_balances(conn),
        "budget_status": budget_service.budget_status(conn, owner, year=year, month=month),
        "top_spending": spending[:5],
        "income_summary": income,
        "summary": period_summary(spending, income),
        "friend_balances": friends,
        "friend_totals": friend_totals(friends),
    }
