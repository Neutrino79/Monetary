"""Purging deleted accounts, leftovers, backups, user exports and storage figures."""
from __future__ import annotations

import os
import sqlite3
import time

import pytest

from monetary.application import admin_service, operations, provisioning
from monetary.infrastructure import control_repository as crepo, db, tenant_store

ACTOR = {"id": None, "role": "superuser"}
PAST = "2020-01-01T00:00:00+00:00"


def _user(control, data_dir, email="ravi@example.com"):
    user, _ = admin_service.create_user(
        control, data_dir, ACTOR, name="Ravi", email=email, timezone="UTC", home_currency_code="INR")
    return user


def _ledger_file(control, data_dir, user):
    workspace = crepo.get_workspace_for_user(control, user["id"])
    return tenant_store.resolve_db_path(data_dir, workspace["db_path"])


def _due(control, data_dir, email="ravi@example.com"):
    user = _user(control, data_dir, email)
    admin_service.delete(control, ACTOR, user["id"])
    crepo.update_user(control, user["id"], now=PAST, delete_after=PAST)
    return user


def test_purge_forgets_due_accounts_and_returns_their_files(control, data_dir):
    user = _due(control, data_dir)
    path = _ledger_file(control, data_dir, user)
    result = operations.purge_due_accounts(control, data_dir)
    control.commit()
    assert result.purged_emails == ["ravi@example.com"]
    assert crepo.get_user(control, user["id"]) is None
    assert crepo.get_workspace_for_user(control, user["id"]) is None
    assert path.exists()  # nothing is deleted before the caller has committed
    assert operations.delete_files(result.files_to_delete) >= 1
    assert not path.exists()
    row = [a for a in crepo.list_audit(control, limit=10, offset=0) if a["action"] == "user.purge"][0]
    assert "ravi@example.com" in row["detail"] and row["target_user_id"] is None


def test_purge_leaves_everyone_else_alone(control, data_dir):
    active = _user(control, data_dir, "active@example.com")
    waiting = _user(control, data_dir, "waiting@example.com")
    admin_service.delete(control, ACTOR, waiting["id"])  # grace period still running
    result = operations.purge_due_accounts(control, data_dir)
    assert result.purged_emails == [] and result.files_to_delete == []
    assert crepo.get_user(control, active["id"]) is not None
    assert crepo.get_user(control, waiting["id"])["status"] == "pending_delete"


def test_an_adopted_file_outside_the_data_directory_is_never_deleted(control, data_dir, tmp_path):
    user = _due(control, data_dir)
    original = _ledger_file(control, data_dir, user)
    outside = tmp_path / "elsewhere.db"
    original.rename(outside)
    control.execute("UPDATE workspace SET db_path = ?", (str(outside),))
    result = operations.purge_due_accounts(control, data_dir)
    assert result.files_to_delete == [] and result.kept_files == [outside]
    assert crepo.get_user(control, user["id"]) is None


def test_orphan_files_are_removed_only_when_old_enough(control, data_dir):
    user = _user(control, data_dir)
    kept = _ledger_file(control, data_dir, user)
    folder = tenant_store.tenants_dir(data_dir)
    old, fresh, tmp = folder / ("a" * 32 + ".db"), folder / ("b" * 32 + ".db"), folder / ("c" * 32 + ".db.tmp")
    for path in (old, fresh, tmp):
        path.write_bytes(b"x")
    long_ago = time.time() - 7200
    for path in (old, tmp):
        os.utime(path, (long_ago, long_ago))
    removed = operations.remove_orphan_files(control, data_dir)
    assert sorted(p.name for p in removed) == sorted([old.name, tmp.name])
    assert kept.exists() and fresh.exists()
    assert operations.remove_orphan_files(control, data_dir / "missing") == []


def test_backup_restores_as_a_data_directory(control, data_dir, tmp_path):
    user = _user(control, data_dir)
    ledger = provisioning.open_ledger(control, data_dir, user["id"])
    ledger.execute("UPDATE user SET phone = 'marker' WHERE is_superuser = 1")
    ledger.commit()
    ledger.close()
    control.commit()  # a backup copies committed data; the helper refuses to run inside a transaction
    summary = operations.backup_all(control, data_dir, tmp_path / "bk")
    assert summary["ledgers"] == 1
    restored = sqlite3.connect(tmp_path / "bk" / "control.db")
    restored.row_factory = sqlite3.Row
    workspace = restored.execute("SELECT public_id, db_path FROM workspace").fetchone()
    assert workspace["db_path"] == workspace["public_id"] + ".db"
    assert restored.execute("SELECT COUNT(*) FROM session").fetchone()[0] == 0
    assert restored.execute("SELECT email FROM user").fetchone()["email"] == "ravi@example.com"
    restored.close()
    copy = db.open_connection(tmp_path / "bk" / "tenants" / workspace["db_path"])
    assert copy.execute("SELECT phone FROM user WHERE is_superuser = 1").fetchone()["phone"] == "marker"
    copy.close()


def test_export_is_a_scrubbed_snapshot_of_the_users_own_ledger(control, data_dir):
    user = _user(control, data_dir)
    ledger = provisioning.open_ledger(control, data_dir, user["id"])
    ledger.execute("UPDATE user SET password_hash = 'x', security_question_id = 1, security_answer_hash = 'y' WHERE is_superuser = 1")
    ledger.execute("INSERT INTO session (owner_id, token_hash, created_at, expires_at) "
                   "SELECT id, 'h', 'a', 'b' FROM user WHERE is_superuser = 1")
    ledger.commit()
    ledger.close()
    path = operations.export_ledger(control, data_dir, user["id"])
    try:
        assert path.read_bytes().startswith(b"SQLite format 3")
        exported = sqlite3.connect(path)
        assert exported.execute("SELECT password_hash, security_answer_hash FROM user WHERE is_superuser = 1").fetchone() == (None, None)
        assert exported.execute("SELECT COUNT(*) FROM session").fetchone()[0] == 0
        assert exported.execute("SELECT email FROM user WHERE is_superuser = 1").fetchone()[0] == "ravi@example.com"
        exported.close()
        assert b"'x'" not in path.read_bytes()
    finally:
        path.unlink()
    live = provisioning.open_ledger(control, data_dir, user["id"])
    assert live.execute("SELECT password_hash FROM user WHERE is_superuser = 1").fetchone()[0] == "x"  # the live ledger is untouched
    live.close()


def test_export_needs_a_ledger(control, data_dir):
    user, _ = admin_service.create_user(control, data_dir, ACTOR, name="G", email="g@example.com",
                                        timezone="UTC", home_currency_code="INR")
    control.execute("DELETE FROM workspace")
    with pytest.raises(provisioning.NoLedgerError):
        operations.export_ledger(control, data_dir, user["id"])


def test_usage_counts_ledgers_and_bytes(control, data_dir):
    assert operations.usage(control, data_dir) == {"ledger_count": 0, "ledger_bytes": 0}
    _user(control, data_dir, "a@example.com")
    _user(control, data_dir, "b@example.com")
    usage = operations.usage(control, data_dir)
    assert usage["ledger_count"] == 2 and usage["ledger_bytes"] > 0
    assert admin_service.stats(control, data_dir)["ledger_count"] == 2


def test_backup_refuses_to_run_inside_an_open_transaction(control, data_dir, tmp_path):
    _user(control, data_dir)  # leaves the control connection with uncommitted writes
    with pytest.raises(RuntimeError, match="Commit or roll back"):
        operations.backup_all(control, data_dir, tmp_path / "bk")
