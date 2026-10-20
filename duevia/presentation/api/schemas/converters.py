"""Small shared converters from raw repo rows / domain values into API schema
objects, so every router formats money and rows the same way."""

from __future__ import annotations

from duevia.domain.money import Money, format_signed
from duevia.presentation.api.schemas.common import MoneyOut


def money_out(points: int, currency: str) -> MoneyOut:
    return MoneyOut(points=points, major=format_signed(points, currency), currency=currency)


def money_value_out(m: Money) -> MoneyOut:
    return MoneyOut(points=m.points, major=m.to_major_units_str(), currency=m.currency)


def transaction_out(view: dict):
    """Flat transaction view (application/transaction_view.py) -> API model."""
    from duevia.presentation.api.schemas.transactions import SplitShareOut, TransactionOut

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
