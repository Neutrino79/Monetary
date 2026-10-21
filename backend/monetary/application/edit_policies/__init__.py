"""Picks the active LedgerEditPolicy from the owner's ledger_mode setting. This is
the one place that knows both policies exist -- everything else just calls
get_edit_policy(mode) and uses whatever comes back."""

from __future__ import annotations

from monetary.application.edit_policies.base import LedgerEditPolicy
from monetary.application.edit_policies.direct import DirectEditPolicy
from monetary.application.edit_policies.strict import StrictEditPolicy
from monetary.domain.enums import LedgerMode

_POLICIES = {
    LedgerMode.STRICT: StrictEditPolicy(),
    LedgerMode.DIRECT: DirectEditPolicy(),
}


def get_edit_policy(ledger_mode: str) -> LedgerEditPolicy:
    return _POLICIES[LedgerMode(ledger_mode)]
