"""Posting strategies for plain (non-split, non-transfer) entries: expense, income,
adjustment. Each function's only job is building a balanced LedgerIntent from
already-validated inputs — no DB access, no validation of ownership/existence.
"""

from __future__ import annotations

from duevia.domain.enums import EntryType, Side
from duevia.domain.ledger import Leg, LedgerIntent
from duevia.domain.money import Money


def build_expense(*, real_account_id, expense_account_id, amount: Money, description,
                   entry_date, memo=None) -> LedgerIntent:
    """A plain expense paid entirely from one of your own real accounts."""
    return LedgerIntent(
        description=description, entry_type=EntryType.NORMAL, currency_code=amount.currency,
        entry_date=entry_date, memo=memo, category_id=expense_account_id,
        legs=[
            Leg(real_account_id, Side.CREDIT, amount),   # money leaves the real account
            Leg(expense_account_id, Side.DEBIT, amount),  # spend increases
        ],
    )


def build_income(*, real_account_id, income_account_id, amount: Money, description,
                  entry_date, memo=None) -> LedgerIntent:
    return LedgerIntent(
        description=description, entry_type=EntryType.NORMAL, currency_code=amount.currency,
        entry_date=entry_date, memo=memo, category_id=income_account_id,
        legs=[
            Leg(real_account_id, Side.DEBIT, amount),    # money enters the real account
            Leg(income_account_id, Side.CREDIT, amount),  # earned increases
        ],
    )


def build_adjustment(*, real_account_id, equity_account_id, amount: Money, side: Side,
                      description, entry_date, memo=None) -> LedgerIntent:
    """A manual correction. side is which way the REAL account moves; the system
    Equity:Adjustments account automatically takes the opposite leg."""
    opposite = Side.CREDIT if side == Side.DEBIT else Side.DEBIT
    return LedgerIntent(
        description=description, entry_type=EntryType.ADJUSTMENT, currency_code=amount.currency,
        entry_date=entry_date, memo=memo,
        legs=[
            Leg(real_account_id, side, amount),
            Leg(equity_account_id, opposite, amount),
        ],
    )
