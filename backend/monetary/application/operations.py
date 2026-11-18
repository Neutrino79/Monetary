"""Housekeeping for a running service: deleting accounts whose grace period is over, clearing
leftovers, backups, a user's own data export, and storage figures.

Two rules shape this module:
- A ledger file is deleted only *after* the control-database change that forgets it has been
  committed, so a failure can never leave an account whose ledger is gone. `purge_due_accounts`
  therefore returns the files and the caller removes them once its transaction is committed.
- A ledger file outside the tenants directory (an adopted legacy file) is never deleted automatically.
"""

from __future__ import annotations

import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from monetary.application import audit_service, provisioning
from monetary.domain.time_utils import utc_now_iso
from monetary.infrastructure import backup, control_repository as crepo, tenant_store

ORPHAN_MIN_AGE_SECONDS = 3600
_SIDECARS = ("", "-wal", "-shm")


@dataclass
class PurgeResult:
    purged_emails: list[str] = field(default_factory=list)
    files_to_delete: list[Path] = field(default_factory=list)
    kept_files: list[Path] = field(default_factory=list)  # adopted files outside the tenants directory


def purge_due_accounts(control, data_dir, *, now: str | None = None) -> PurgeResult:
    """Forget every account whose deletion grace period has ended.

    Removes the account, its workspace and sessions from the control database and writes an audit row
    that keeps the email (the user row is gone afterwards). The caller commits, then calls
    `delete_files(result.files_to_delete)`."""
    result = PurgeResult()
    tenants = tenant_store.tenants_dir(data_dir).resolve()
    for user in crepo.list_due_for_deletion(control, now or utc_now_iso()):
        workspace = crepo.get_workspace_for_user(control, user["id"])
        if workspace is not None:
            path = tenant_store.resolve_db_path(data_dir, workspace["db_path"])
            if path.resolve().parent == tenants:
                result.files_to_delete.extend(Path(str(path) + s) for s in _SIDECARS)
            else:
                result.kept_files.append(path)
            crepo.delete_workspace(control, workspace["id"])
        crepo.delete_user(control, user["id"])
        audit_service.record(control, actor_user_id=None, action="user.purge", target_user_id=None,
                             detail={"email": user["email"], "user_id": user["id"]}, ip=None)
        result.purged_emails.append(user["email"])
    return result


def delete_files(paths: list[Path]) -> int:
    removed = 0
    for path in paths:
        try:
            path.unlink()
            removed += 1
        except FileNotFoundError:
            pass
    return removed


def remove_orphan_files(control, data_dir, *, min_age_seconds: float = ORPHAN_MIN_AGE_SECONDS) -> list[Path]:
    """Delete files in the tenants directory that no workspace refers to (left by a crashed
    provisioning or a rolled-back request). Recent files are spared: they may belong to a request that
    is still running."""
    directory = tenant_store.tenants_dir(data_dir)
    if not directory.is_dir():
        return []
    known = {tenant_store.resolve_db_path(data_dir, w["db_path"]).name for w in crepo.list_workspaces(control)}
    cutoff = time.time() - min_age_seconds
    removed: list[Path] = []
    for path in sorted(directory.iterdir()):
        base = path.name.removesuffix(".tmp").removesuffix("-wal").removesuffix("-shm")
        if base in known or not path.is_file() or path.stat().st_mtime > cutoff:
            continue
        path.unlink()
        removed.append(path)
    return removed


def backup_all(control, data_dir, destination: str | Path) -> dict:
    """Copy the control database and every ledger into `destination` as consistent snapshots.

    The result is one folder that can be restored as a data directory: `control.db` and `tenants/`."""
    destination = Path(destination)
    from monetary.infrastructure import control_db

    control_copy = backup.copy_database(control, destination / control_db.CONTROL_DB_FILENAME)
    count = 0
    for workspace in crepo.list_workspaces(control):
        source_path = tenant_store.resolve_db_path(data_dir, workspace["db_path"])
        if not source_path.exists():
            continue
        from monetary.infrastructure import db as db_module

        source = db_module.open_connection(source_path)
        try:
            backup.copy_database(source, destination / tenant_store.TENANTS_DIRNAME / f"{workspace['public_id']}.db")
        finally:
            source.close()
        count += 1
    backup.make_control_portable(control_copy)
    return {"ledgers": count, "destination": str(destination)}


def export_ledger(control, data_dir, user_id: int) -> Path:
    """A snapshot of one user's own ledger as a SQLite file in a temporary folder, without any
    credentials in it. The caller deletes the file after sending it."""
    ledger = provisioning.open_ledger(control, data_dir, user_id)
    if ledger is None:
        raise provisioning.NoLedgerError("This account has no ledger.")
    folder = Path(tempfile.mkdtemp(prefix="monetary-export-"))
    os.chmod(folder, 0o700)
    try:
        target = backup.copy_database(ledger, folder / "ledger.db")
    finally:
        ledger.close()
    backup.scrub_credentials(target)
    return target


def usage(control, data_dir) -> dict:
    """How many ledgers exist and how much disk they use (rough: the files, not their free space)."""
    total = 0
    count = 0
    for workspace in crepo.list_workspaces(control):
        path = tenant_store.resolve_db_path(data_dir, workspace["db_path"])
        for suffix in _SIDECARS:
            candidate = Path(str(path) + suffix)
            if candidate.exists():
                total += candidate.stat().st_size
        count += 1
    return {"ledger_count": count, "ledger_bytes": total}
