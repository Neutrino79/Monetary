"""STRICT mode: nothing posted is ever updated or deleted. Corrections are a
reversal of the original plus a fresh entry for the new state; deletion is just
a reversal with no replacement.
"""

from __future__ import annotations

from duevia.application import ledger_service
from duevia.domain.ledger import LedgerIntent


class StrictEditPolicy:
    def correct(self, conn, entry_id: int, new_intent: LedgerIntent) -> dict:
        ledger_service.reverse(
            conn, entry_id,
            description=f"Correction of #{entry_id} (reversed)",
        )
        return ledger_service.post(conn, new_intent)

    def delete(self, conn, entry_id: int) -> None:
        ledger_service.reverse(conn, entry_id)
