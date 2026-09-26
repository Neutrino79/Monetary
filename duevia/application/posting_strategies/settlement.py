"""Posting strategy for settlements. Deliberately simple compared to V1: no
share_id, no offset table — just "pay real cash into a real account, reduce
that friend's running DUE balance by the same amount." Netting (the tea/dinner
case) already happened automatically when the fronted expense was posted; a
settlement never needs to know anything about that.
"""

from __future__ import annotations

from duevia.domain.enums import EntryType, Side
from duevia.domain.ledger import Leg, LedgerIntent
from duevia.domain.money import Money


def build_settlement(*, real_account_id, friend_due_account_id, amount: Money, description,
                      entry_date, memo=None) -> LedgerIntent:
    """Friend owes owner; owner receives cash."""
    return LedgerIntent(
        description=description, entry_type=EntryType.SETTLEMENT, currency_code=amount.currency,
        entry_date=entry_date, memo=memo,
        legs=[
            Leg(real_account_id, Side.DEBIT, amount),       # cash received
            Leg(friend_due_account_id, Side.CREDIT, amount),  # they owe less
        ],
    )


def build_repayment(*, real_account_id, friend_due_account_id, amount: Money, description,
                     entry_date, memo=None) -> LedgerIntent:
    """Owner owes friend; owner pays cash out -- the symmetric reverse direction."""
    return LedgerIntent(
        description=description, entry_type=EntryType.SETTLEMENT, currency_code=amount.currency,
        entry_date=entry_date, memo=memo,
        legs=[
            Leg(real_account_id, Side.CREDIT, amount),      # cash paid out
            Leg(friend_due_account_id, Side.DEBIT, amount),  # owner owes less
        ],
    )
