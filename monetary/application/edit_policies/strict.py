"""STRICT mode: nothing posted is ever updated or deleted. Corrections are a
reversal of the original plus a fresh entry for the new state; deletion is just
a reversal with no replacement.
"""

from __future__ import annotations

from monetary.application import ledger_service
from monetary.domain.ledger import LedgerIntent
from monetary.infrastructure import repositories as repo


class StrictEditPolicy:
    def correct(self, conn, entry_id: int, new_intent: LedgerIntent) -> dict:
        ledger_service.reverse(
            conn, entry_id,
            description=f"Correction of #{entry_id} (reversed)",
        )
        replacement = ledger_service.post(conn, new_intent)
        repo.set_correction_of(conn, replacement["id"], entry_id)
        return repo.get_journal_entry(conn, replacement["id"])

    def delete(self, conn, entry_id: int) -> None:
        ledger_service.reverse(conn, entry_id)
