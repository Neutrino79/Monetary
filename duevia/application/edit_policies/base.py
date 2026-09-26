"""LedgerEditPolicy: how a correction or deletion is actually carried out.
LedgerService never branches on ledger_mode itself — it asks "what's the active
policy?" and delegates. Both concrete policies below produce the same *target*
state (computed by the same posting strategies used at creation time); they only
differ in *how* they get the database there. See architecture plan §5.4.
"""

from __future__ import annotations

from typing import Protocol

from duevia.domain.ledger import LedgerIntent


class LedgerEditPolicy(Protocol):
    def correct(self, conn, entry_id: int, new_intent: LedgerIntent) -> dict:
        """Apply new_intent as the corrected state of entry_id. Returns the
        resulting (possibly new) journal_entry row."""
        ...

    def delete(self, conn, entry_id: int) -> None:
        """Remove entry_id's financial effect."""
        ...
