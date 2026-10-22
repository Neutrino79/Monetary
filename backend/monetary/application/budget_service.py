"""Budget application service. Spend for a category is always SUM(debits) on
that EXPENSE account (rolled up from its direct children) within the period --
no CASH/ACCRUAL toggle needed, because a friend's share was never posted to the
expense account in the first place (see posting_strategies/split.py).
"""

from __future__ import annotations

from monetary.domain.money import Money
from monetary.domain.time_utils import current_year_month, month_bounds_utc_iso
from monetary.application import statement_service
from monetary.infrastructure import repositories as repo


def budget_status(conn, owner, *, year=None, month=None) -> list[dict]:
    tz = owner["timezone"]
    if year is None or month is None:
        year, month = current_year_month(tz)
    start_iso, end_iso = month_bounds_utc_iso(tz, year, month)

    fronted = statement_service.fronted_unpaid(conn)
    results = []
    for root in repo.budgeted_root_accounts(conn):
        child_ids = repo.child_account_ids(conn, root["id"])
        account_ids = [root["id"]] + child_ids
        debit, credit = repo.account_period_debit_credit(conn, account_ids, start_iso, end_iso)
        spent_points = debit - credit  # EXPENSE normal side = DEBIT

        currency = root["currency_code"]
        budget = Money(root["budget_limit"], currency)
        spent = Money(max(spent_points, 0), currency)
        remaining_points = budget.points - spent_points
        pct = (spent_points / budget.points * 100) if budget.points else 0.0

        # friend-fronted spend in this category (and its subcategories) this month that is not repaid yet
        not_paid_back = sum(
            f["unpaid_points"] for f in fronted
            if f["category_id"] in account_ids and start_iso <= f["entry_date"] < end_iso)
        results.append({
            "category_id": root["id"],
            "category_name": root["name"],
            "year": year,
            "month": month,
            "budget": budget,
            "spent": spent,
            "remaining_points": remaining_points,
            "currency": currency,
            "percentage_used": pct,
            "over_budget": spent_points > budget.points,
            "not_paid_back_points": not_paid_back,
        })
    return results
