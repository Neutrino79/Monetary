"""The vocabulary posting strategies use to describe an economic event, before
it's persisted. A LedgerService knows how to persist any balanced LedgerIntent —
it has no idea what "a split" or "a credit card payment" means; that knowledge
lives entirely in application/posting_strategies/.
"""

from __future__ import annotations

from dataclasses import dataclass

from duevia.domain.enums import EntryType, Side
from duevia.domain.exceptions import ValidationError
from duevia.domain.money import Money


@dataclass(frozen=True)
class Leg:
    """One movement against one account. amount is always a positive magnitude;
    side says which column (debit/credit) it lands in."""
    account_id: int
    side: Side
    amount: Money


@dataclass(frozen=True)
class LedgerIntent:
    """Everything needed to post one journal entry."""
    description: str
    entry_type: EntryType
    currency_code: str
    entry_date: str  # UTC ISO string
    legs: list[Leg]
    memo: str | None = None
    refund_of_id: int | None = None
    category_id: int | None = None  # stored directly on journal_entry -- not derived from
                                     # postings, since a zero-owner-share SPLIT has no
                                     # expense-account posting to derive it from

    def __post_init__(self):
        if len(self.legs) < 2:
            raise ValidationError("A journal entry needs at least two legs.")
        assert_balanced(self.legs, self.currency_code)


def assert_balanced(legs: list[Leg], currency_code: str) -> None:
    """The core invariant: SUM(debit) == SUM(credit), every currency matches."""
    debit_total = 0
    credit_total = 0
    for leg in legs:
        if leg.amount.currency != currency_code:
            raise ValidationError(
                f"Leg currency {leg.amount.currency} does not match entry currency {currency_code}."
            )
        if leg.side == Side.DEBIT:
            debit_total += leg.amount.points
        else:
            credit_total += leg.amount.points
    if debit_total != credit_total:
        raise ValidationError(
            f"Journal entry does not balance: debits={debit_total}, credits={credit_total}."
        )
