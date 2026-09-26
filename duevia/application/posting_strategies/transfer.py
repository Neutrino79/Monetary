"""Posting strategy for transfers between two of the owner's own real accounts.
Works identically for ASSET<->ASSET, ASSET<->LIABILITY (e.g. paying off a credit
card) — the per-type normal_side convention handles the sign automatically."""

from __future__ import annotations

from duevia.domain.enums import EntryType, Side
from duevia.domain.ledger import Leg, LedgerIntent
from duevia.domain.money import Money


def build_transfer(*, from_account_id, to_account_id, amount: Money, description,
                    entry_date, memo=None) -> LedgerIntent:
    return LedgerIntent(
        description=description, entry_type=EntryType.TRANSFER, currency_code=amount.currency,
        entry_date=entry_date, memo=memo,
        legs=[
            Leg(from_account_id, Side.CREDIT, amount),  # decreases the source
            Leg(to_account_id, Side.DEBIT, amount),      # increases the destination
        ],
    )
