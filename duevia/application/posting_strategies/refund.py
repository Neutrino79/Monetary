"""Posting strategy for refunds. Always linked to the original expense entry via
refund_of_id (required). The same two-leg shape works whether real_account_id is
an ASSET (refund adds cash) or a LIABILITY (refund reduces what you owe) — the
per-account-type normal_side convention makes that automatic, no special-casing
needed.
"""

from __future__ import annotations

from duevia.domain.enums import EntryType, Side
from duevia.domain.ledger import Leg, LedgerIntent
from duevia.domain.money import Money


def build_refund(*, real_account_id, expense_account_id, amount: Money, description,
                  entry_date, refund_of_id: int, memo=None) -> LedgerIntent:
    return LedgerIntent(
        description=description, entry_type=EntryType.REFUND, currency_code=amount.currency,
        entry_date=entry_date, memo=memo, refund_of_id=refund_of_id, category_id=expense_account_id,
        legs=[
            Leg(real_account_id, Side.DEBIT, amount),      # money/credit comes back
            Leg(expense_account_id, Side.CREDIT, amount),   # spend goes down
        ],
    )
