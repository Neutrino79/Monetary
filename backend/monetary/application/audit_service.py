"""Writing the append-only audit log in the control database."""

from __future__ import annotations

import json

from monetary.domain.time_utils import utc_now_iso
from monetary.infrastructure import control_repository as crepo


def record(conn, *, actor_user_id: int | None, action: str, target_user_id: int | None = None,
           detail: dict | None = None, ip: str | None = None) -> None:
    """Add one audit row. `detail` must be small and must never contain secrets (passwords, tokens)."""
    crepo.add_audit(
        conn, at=utc_now_iso(), actor_user_id=actor_user_id, action=action,
        target_user_id=target_user_id,
        detail=json.dumps(detail, sort_keys=True, separators=(",", ":")) if detail else None, ip=ip,
    )
