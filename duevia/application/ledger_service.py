"""LedgerService: the one place postings actually get written. It enforces the
zero-sum invariant and knows how to build a reversal of an existing entry — and
nothing else. It has no idea what "a split" or "a credit card payment" is; that
knowledge lives in application/posting_strategies/."""

from __future__ import annotations

from duevia.domain.enums import EntryType, Side
from duevia.domain.exceptions import ConflictError, NotFoundError
from duevia.domain.ledger import Leg, LedgerIntent, assert_balanced
from duevia.domain.money import Money
from duevia.domain.time_utils import utc_now_iso
from duevia.infrastructure import repositories as repo


def post(conn, intent: LedgerIntent) -> dict:
    """Persist a fully-formed, already-balanced LedgerIntent as a new POSTED entry.
    Does NOT wrap itself in a transaction — the caller (a single-call application
    service, or a compound operation like a correction) owns that boundary, so
    that a multi-step operation commits or rolls back as one atomic unit rather
    than each nested call committing prematurely on its own."""
    now = utc_now_iso()
    entry = repo.create_journal_entry(
        conn, description=intent.description, memo=intent.memo,
        entry_type=intent.entry_type.value, currency_code=intent.currency_code,
        entry_date=intent.entry_date, status="POSTED", reversal_of_id=None,
        refund_of_id=intent.refund_of_id, category_id=intent.category_id, now=now,
    )
    _write_legs(conn, entry["id"], intent.legs, now)
    return repo.get_journal_entry(conn, entry["id"])


def _write_legs(conn, entry_id, legs: list[Leg], now) -> None:
    for leg in legs:
        debit = leg.amount.points if leg.side == Side.DEBIT else 0
        credit = leg.amount.points if leg.side == Side.CREDIT else 0
        repo.create_posting(conn, journal_entry_id=entry_id, account_id=leg.account_id,
                             debit_amount=debit, credit_amount=credit, now=now)


def get_entry_or_raise(conn, entry_id) -> dict:
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        raise NotFoundError(f"Journal entry {entry_id} not found.")
    return entry


def legs_for_entry(conn, entry_id) -> list[Leg]:
    postings = repo.postings_for_entry(conn, entry_id)
    entry = repo.get_journal_entry(conn, entry_id)
    currency = entry["currency_code"]
    legs = []
    for p in postings:
        if p["debit_amount"] > 0:
            legs.append(Leg(p["account_id"], Side.DEBIT, Money(p["debit_amount"], currency)))
        else:
            legs.append(Leg(p["account_id"], Side.CREDIT, Money(p["credit_amount"], currency)))
    return legs


def mirror_legs(legs: list[Leg]) -> list[Leg]:
    """Flip every leg's side — this is what a reversal entry's legs are."""
    return [
        Leg(leg.account_id, Side.CREDIT if leg.side == Side.DEBIT else Side.DEBIT, leg.amount)
        for leg in legs
    ]


def reverse(conn, entry_id, *, description=None) -> dict:
    """Post a REVERSAL entry that exactly mirrors an existing entry's legs.
    Same no-internal-transaction discipline as post() — see its docstring."""
    original = get_entry_or_raise(conn, entry_id)
    if original["status"] == "REVERSED":
        raise ConflictError(f"Journal entry {entry_id} is already reversed.")
    original_legs = legs_for_entry(conn, entry_id)
    reversal_legs = mirror_legs(original_legs)

    now = utc_now_iso()
    reversal_entry = repo.create_journal_entry(
        conn, description=description or f"Reversal of #{entry_id}: {original['description']}",
        memo=None, entry_type=EntryType.REVERSAL.value, currency_code=original["currency_code"],
        entry_date=now, status="POSTED", reversal_of_id=entry_id, refund_of_id=None,
        category_id=original["category_id"], now=now,
    )
    _write_legs(conn, reversal_entry["id"], reversal_legs, now)
    repo.mark_entry_reversed(conn, entry_id, reversal_entry["id"], now)
    return repo.get_journal_entry(conn, reversal_entry["id"])
