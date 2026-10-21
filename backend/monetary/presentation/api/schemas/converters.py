"""Small shared converters from raw repo rows / domain values into API schema
objects, so every router formats money and rows the same way."""

from __future__ import annotations

from monetary.domain.money import Money, format_signed
from monetary.presentation.api.schemas.common import MoneyOut
from monetary.presentation.api.schemas.friends import FriendBalanceOut
from monetary.presentation.api.schemas.reports import (
    AccountBalanceRowOut,
    BudgetStatusOut,
    CategoryChildTotalOut,
    CategoryTotalOut,
    NetWorthOut,
)


def money_out(points: int, currency: str) -> MoneyOut:
    return MoneyOut(points=points, major=format_signed(points, currency), currency=currency)


def money_value_out(m: Money) -> MoneyOut:
    return MoneyOut(points=m.points, major=m.to_major_units_str(), currency=m.currency)


def transaction_out(view: dict):
    """Flat transaction view (application/transaction_view.py) -> API model."""
    from monetary.presentation.api.schemas.transactions import SplitShareOut, TransactionOut

    cur = view["currency"]
    return TransactionOut(
        id=view["id"], type=view["type"], description=view["description"], memo=view["memo"],
        date=view["date"], currency=cur, status=view["status"],
        amount=money_out(view["amount_points"], cur),
        account_id=view["account_id"], to_account_id=view["to_account_id"],
        category_id=view["category_id"], friend_id=view["friend_id"], direction=view["direction"],
        your_share=(money_out(view["your_share_points"], cur) if view["your_share_points"] is not None else None),
        splits=([SplitShareOut(friend_id=f, share=money_out(p, cur)) for f, p in view["splits"]]
                if view["splits"] is not None else None),
        refund_of_id=view["refund_of_id"], correction_of=view["correction_of"],
        replaced_by=view["replaced_by"], created_at=view["created_at"], updated_at=view["updated_at"],
    )


# --- report rows (shared by /reports/* and the dashboard, which embeds the same shapes) ---

def account_balance_row_out(r: dict) -> AccountBalanceRowOut:
    return AccountBalanceRowOut(
        account_id=r["account_id"], name=r["name"], account_type=r["account_type"],
        is_active=r["is_active"], balance=money_out(r["points"], r["currency"]))


def budget_status_out(r: dict) -> BudgetStatusOut:
    cur = r["currency"]
    return BudgetStatusOut(
        category_id=r["category_id"], category_name=r["category_name"], year=r["year"], month=r["month"],
        budget=money_out(r["budget"].points, cur), spent=money_out(r["spent"].points, cur),
        remaining=money_out(r["remaining_points"], cur), percentage_used=r["percentage_used"],
        over_budget=r["over_budget"])


def net_worth_out(r: dict) -> NetWorthOut:
    cur = r["currency"]
    return NetWorthOut(
        currency=cur, assets=money_out(r["assets"], cur),
        liabilities=money_out(r["liabilities"], cur), net_worth=money_out(r["net_worth"], cur))


def category_total_out(r: dict) -> CategoryTotalOut:
    cur = r["currency"]
    return CategoryTotalOut(
        category_id=r["category_id"], category_name=r["category_name"], total=money_out(r["total_points"], cur),
        year=r["year"], month=r["month"],
        children=[CategoryChildTotalOut(category_id=ch["category_id"], category_name=ch["category_name"],
                                        total=money_out(ch["total_points"], cur)) for ch in r.get("children", [])])


def friend_balance_out(r: dict) -> FriendBalanceOut:
    return FriendBalanceOut(
        friend_id=r["friend_id"], friend_name=r["friend_name"], balance=money_out(r["points"], r["currency"]))
