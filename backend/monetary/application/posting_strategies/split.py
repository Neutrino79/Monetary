"""Posting strategies for expenses involving a friend: a split (you paid, one
or more friends owe their share) and a friend-fronted expense (a friend paid
100% — the "tea" case — no real account of yours is touched at all).

The key design point: a friend's share NEVER posts to the expense account. Only
the owner's own real share does. This is what makes category "spend" always
immediately correct — there is nothing to net later as the friend pays you back,
because their portion was never counted as your spend in the first place.

Everything needed to reconstruct "who was on this split and what's their share"
is fully recoverable from the postings themselves (the expense-account leg is
the owner's share; each DUE-account leg is a friend's share) — no separate
split_participant table needed. See application/split_service.py's
split_composition() for that read side.
"""

from __future__ import annotations

from monetary.domain.enums import EntryType, Side
from monetary.domain.ledger import Leg, LedgerIntent
from monetary.domain.money import Money


def build_split_expense(*, real_account_id, expense_account_id, owner_share: Money,
                         friend_shares: list[tuple[int, Money]], description, entry_date,
                         memo=None) -> LedgerIntent:
    """
    real_account_id: the owner's paying account.
    owner_share: the owner's own fair portion — may be zero if they didn't
        personally benefit at all (rare, but not disallowed).
    friend_shares: [(friend_due_account_id, their share), ...]
    """
    total = owner_share
    for _, share in friend_shares:
        total = total + share
    currency = total.currency

    legs: list[Leg] = [Leg(real_account_id, Side.CREDIT, total)]
    if owner_share.points > 0:
        legs.append(Leg(expense_account_id, Side.DEBIT, owner_share))
    for friend_due_account_id, share in friend_shares:
        legs.append(Leg(friend_due_account_id, Side.DEBIT, share))

    return LedgerIntent(
        description=description, entry_type=EntryType.SPLIT, currency_code=currency,
        entry_date=entry_date, memo=memo, legs=legs, category_id=expense_account_id,
    )


def build_friend_fronted_expense(*, expense_account_id, friend_due_account_id, amount: Money,
                                  description, entry_date, memo=None) -> LedgerIntent:
    """A friend paid the entire thing on your behalf (e.g. buying you tea) — no
    real account of yours is touched; you now owe them instead."""
    return LedgerIntent(
        description=description, entry_type=EntryType.FRONTED, currency_code=amount.currency,
        entry_date=entry_date, memo=memo, category_id=expense_account_id,
        legs=[
            Leg(expense_account_id, Side.DEBIT, amount),
            Leg(friend_due_account_id, Side.CREDIT, amount),
        ],
    )
