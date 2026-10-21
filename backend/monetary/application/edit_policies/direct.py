"""DIRECT mode: corrections and deletions mutate the existing rows directly.
The zero-sum invariant and every other validation rule still apply — this mode
only trades away history, never correctness (see architecture plan §5.1). Since
balances are always computed live from whatever posting rows currently exist,
mutating them in place is always safe with respect to every *other* entry that
already posted against the same accounts (e.g. an independent settlement).
"""

from __future__ import annotations

from monetary.application import ledger_service
from monetary.domain.enums import Side
from monetary.domain.ledger import LedgerIntent
from monetary.domain.time_utils import utc_now_iso
from monetary.infrastructure import repositories as repo


class DirectEditPolicy:
    def correct(self, conn, entry_id: int, new_intent: LedgerIntent) -> dict:
        now = utc_now_iso()
        old_legs = ledger_service.legs_for_entry(conn, entry_id)
        _reconcile_postings(conn, entry_id, old_legs, new_intent.legs, now)
        return repo.update_journal_entry_fields(
            conn, entry_id, description=new_intent.description, memo=new_intent.memo,
            entry_date=new_intent.entry_date, category_id=new_intent.category_id,
            category_id_set=True, now=now,
        )

    def delete(self, conn, entry_id: int) -> None:
        repo.hard_delete_journal_entry(conn, entry_id)


def _reconcile_postings(conn, entry_id, old_legs, new_legs, now) -> None:
    old_by_account = {p["account_id"]: p for p in repo.postings_for_entry(conn, entry_id)}
    new_by_account = {leg.account_id: leg for leg in new_legs}

    for account_id, posting in old_by_account.items():
        if account_id not in new_by_account:
            repo.delete_posting(conn, posting["id"])
            continue
        leg = new_by_account[account_id]
        debit = leg.amount.points if leg.side == Side.DEBIT else 0
        credit = leg.amount.points if leg.side == Side.CREDIT else 0
        if posting["debit_amount"] != debit or posting["credit_amount"] != credit:
            repo.update_posting_amounts(conn, posting["id"], debit, credit, now)

    for account_id, leg in new_by_account.items():
        if account_id not in old_by_account:
            debit = leg.amount.points if leg.side == Side.DEBIT else 0
            credit = leg.amount.points if leg.side == Side.CREDIT else 0
            repo.create_posting(conn, journal_entry_id=entry_id, account_id=account_id,
                                 debit_amount=debit, credit_amount=credit, now=now)
