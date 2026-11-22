"""Creating and adopting per-user ledger databases.

`provision_ledger` builds a brand-new ledger file for an account; `adopt_legacy_ledger` turns the
single-owner database of an earlier release into the first account's ledger without copying data.
Both only touch the control database through the caller's connection; the caller owns the commit.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from monetary.application import audit_service, seed_service, user_service
from monetary.domain.enums import PlatformRole, UserStatus
from monetary.domain.exceptions import NoLedgerError, NotFoundError
from monetary.domain.time_utils import utc_now_iso
from monetary.infrastructure import control_repository as crepo
from monetary.infrastructure import db, legacy_ledger, migrations, tenant_store

logger = logging.getLogger(__name__)


def provision_ledger(control, data_dir: str | Path, user_id: int, *, seed_defaults: bool = True) -> dict:
    """Give an account its own ledger database and return the new `workspace` row.

    Idempotent: an account that already has a ledger gets that one back. The file is built under a
    temporary name and renamed into place, so a crash never leaves a half-built ledger behind. If the
    caller's control-database commit then fails, an unreferenced file remains; it is harmless and the
    cleanup tooling removes it."""
    account = crepo.get_user(control, user_id)
    if account is None:
        raise NotFoundError(f"User {user_id} not found.")
    existing = crepo.get_workspace_for_user(control, user_id)
    if existing is not None:
        return existing

    public_id = tenant_store.new_public_id()
    final = tenant_store.tenants_dir(data_dir) / tenant_store.filename_for(public_id)
    temporary = final.with_name(final.name + ".tmp")
    try:
        ledger = db.connect(temporary)
        try:
            settings = user_service.create_ledger_settings(
                ledger, timezone=account["timezone"], home_currency_code=account["home_currency_code"] or "INR",
            )
            if seed_defaults:
                seed_service.seed_default_categories(ledger, currency_code=settings["home_currency_code"])
            ledger.commit()
            ledger.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            ledger.close()
        os.replace(temporary, final)
    except BaseException:
        for leftover in (temporary, Path(str(temporary) + "-wal"), Path(str(temporary) + "-shm")):
            leftover.unlink(missing_ok=True)
        raise

    workspace = crepo.create_workspace(
        control, public_id=public_id, db_path=final.name,
        schema_version=migrations.latest_version(db.TENANT_MIGRATIONS), now=utc_now_iso(),
    )
    crepo.add_membership(control, workspace_id=workspace["id"], user_id=user_id)
    return workspace


def open_ledger(control, data_dir: str | Path, user_id: int):
    """Open the ledger database of an account (applying any pending migration), or None if it has none."""
    workspace = crepo.get_workspace_for_user(control, user_id)
    if workspace is None:
        return None
    return db.connect(tenant_store.resolve_db_path(data_dir, workspace["db_path"]))


def adopt_legacy_ledger(control, data_dir: str | Path, legacy_path: str | Path) -> dict | None:
    """First start after upgrading from a single-owner release.

    When the control database has no accounts yet and `legacy_path` is a ledger with an owner, create
    that owner as the first account (an active superuser) and register the *same file* as their
    ledger. Nothing in the ledger is copied or changed. Returns the new account, or None when there is
    nothing to adopt."""
    if crepo.count_users(control) > 0:
        return None
    path = Path(legacy_path)
    if not path.is_file():
        return None
    owner = legacy_ledger.read_owner(path)  # before the file is opened: opening upgrades it
    if owner is None or not owner["password_hash"]:
        return None

    now = utc_now_iso()
    account = crepo.create_user(
        control, email=owner["email"].strip().lower(), name=owner["name"], password_hash=owner["password_hash"],
        security_question_id=owner["security_question_id"], security_answer_hash=owner["security_answer_hash"],
        role=PlatformRole.SUPERUSER.value, status=UserStatus.ACTIVE.value, timezone=owner["timezone"],
        home_currency_code=owner["home_currency_code"], approved_at=now, now=now,
    )
    workspace = crepo.create_workspace(
        control, public_id=tenant_store.new_public_id(), db_path=str(path.resolve()),
        schema_version=migrations.latest_version(db.TENANT_MIGRATIONS), now=now,
    )
    crepo.add_membership(control, workspace_id=workspace["id"], user_id=account["id"])
    ledger = db.connect(path)  # upgrade the adopted file now so a failure shows at start-up, not at first use
    ledger.close()
    audit_service.record(control, actor_user_id=None, action="user.adopt_legacy_ledger",
                         target_user_id=account["id"], detail={"email": account["email"]})
    logger.warning("Adopted the existing ledger %s as the ledger of %s (superuser).", path, account["email"])
    return account


def require_ledger(control, user_id: int) -> dict:
    workspace = crepo.get_workspace_for_user(control, user_id)
    if workspace is None:
        raise NoLedgerError("This account has no ledger.")
    return workspace
