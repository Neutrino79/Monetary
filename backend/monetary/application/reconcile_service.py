"""Reconcile an account with the bank: the owner says what the bank (or card statement) shows, and any
difference is posted as an adjustment so the ledger balance matches it."""

from __future__ import annotations

from monetary.application import account_service, transaction_service
from monetary.domain.enums import AccountType, Side
from monetary.domain.exceptions import ValidationError
from monetary.domain.money import Money


def reconcile(conn, owner, account_id: int, *, balance_major: str, date_str: str | None = None) -> dict:
    """Returns {difference_points, entry_id, currency}; difference = bank balance - ledger balance, and
    `entry_id` is None when they already agree. For a liability the balance is the amount owed."""
    account = account_service.get_real_account_or_raise(conn, account_id)
    currency = account["currency_code"]
    try:
        target = Money.from_major_units(balance_major, currency, allow_zero=True).points
    except ValueError as e:                                         # MoneyError subclasses ValueError
        raise ValidationError(str(e)) from e
    current, _ = account_service.get_balance(conn, account_id)
    difference = target - current
    if difference == 0:
        return {"difference_points": 0, "entry_id": None, "currency": currency}
    is_asset = account["account_type"] == AccountType.ASSET.value
    raises = difference > 0                                          # the account's balance must go up
    side = Side.DEBIT if raises == is_asset else Side.CREDIT
    label = "card statement" if account["account_type"] == AccountType.LIABILITY.value else "bank"
    entry = transaction_service.record_adjustment(
        conn, owner, account_id=account_id, amount_major=Money(abs(difference), currency).to_major_units_str(),
        side=side.value, description=f"Reconciled with {label}", date_str=date_str)
    return {"difference_points": difference, "entry_id": entry["id"], "currency": currency}
