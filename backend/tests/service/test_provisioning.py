"""Creating per-user ledgers and adopting a single-owner database from an earlier release."""
import sqlite3

import pytest

from monetary.application import identity_service as acc
from monetary.application import provisioning, user_service
from monetary.domain.exceptions import NoLedgerError, NotFoundError
from monetary.infrastructure import control_repository as crepo
from monetary.infrastructure import db, tenant_store
from monetary.infrastructure import migrations as mig
from monetary.infrastructure import repositories as repo


def _account(control, email="asha@example.com", name="Asha Rao", **kw):
    return crepo.create_user(control, email=email, name=name, password_hash="h", role="user", status="active",  # pragma: allowlist secret
                             timezone="Asia/Kolkata", home_currency_code=kw.pop("currency", "INR"),
                             now="2026-01-01T00:00:00+00:00", **kw)


def test_provisioning_builds_a_ledger_with_the_owner_the_equity_account_and_default_categories(control, data_dir):
    u = _account(control)
    ws = provisioning.provision_ledger(control, data_dir, u["id"])
    assert ws["db_path"] == tenant_store.filename_for(ws["public_id"])
    assert ws["schema_version"] == mig.latest_version(db.TENANT_MIGRATIONS)
    assert crepo.get_workspace_for_user(control, u["id"])["id"] == ws["id"]

    ledger = provisioning.open_ledger(control, data_dir, u["id"])
    owner = repo.get_superuser(ledger)
    assert (owner["name"], owner["email"], owner["timezone"], owner["home_currency_code"]) == (
        "Asha Rao", "asha@example.com", "Asia/Kolkata", "INR")
    assert owner["password_hash"] is None and owner["security_answer_hash"] is None  # credentials stay in control
    assert repo.get_system_account(ledger, "EQUITY") is not None
    assert ledger.execute("SELECT COUNT(*) FROM account WHERE account_type = 'EXPENSE'").fetchone()[0] > 0
    ledger.close()


def test_provisioning_is_idempotent_and_leaves_no_temporary_files(control, data_dir):
    u = _account(control)
    first = provisioning.provision_ledger(control, data_dir, u["id"])
    again = provisioning.provision_ledger(control, data_dir, u["id"])
    assert first["id"] == again["id"]
    assert sorted(p.name for p in (data_dir / "tenants").iterdir()) == [first["db_path"]]


def test_seeding_can_be_skipped(control, data_dir):
    u = _account(control)
    provisioning.provision_ledger(control, data_dir, u["id"], seed_defaults=False)
    ledger = provisioning.open_ledger(control, data_dir, u["id"])
    assert ledger.execute("SELECT COUNT(*) FROM account WHERE account_type = 'EXPENSE'").fetchone()[0] == 0
    ledger.close()


def test_two_accounts_get_two_separate_ledgers(control, data_dir):
    a, b = _account(control), _account(control, email="b@example.com", name="B")
    wa = provisioning.provision_ledger(control, data_dir, a["id"])
    wb = provisioning.provision_ledger(control, data_dir, b["id"])
    assert wa["db_path"] != wb["db_path"]
    la, lb = (provisioning.open_ledger(control, data_dir, x["id"]) for x in (a, b))
    la.execute("INSERT INTO tag (name) VALUES ('only-in-a')")
    la.commit()
    assert lb.execute("SELECT COUNT(*) FROM tag").fetchone()[0] == 0
    assert repo.get_superuser(lb)["email"] == "b@example.com"
    la.close(), lb.close()


def test_a_failed_build_leaves_nothing_behind(control, data_dir, monkeypatch):
    u = _account(control)

    def boom(*a, **k):
        raise RuntimeError("disk full")

    monkeypatch.setattr(provisioning.seed_service, "seed_default_categories", boom)
    with pytest.raises(RuntimeError):
        provisioning.provision_ledger(control, data_dir, u["id"])
    assert list((data_dir / "tenants").iterdir()) == []
    assert crepo.get_workspace_for_user(control, u["id"]) is None


def test_unknown_accounts_and_accounts_without_a_ledger_are_reported(control, data_dir):
    with pytest.raises(NotFoundError):
        provisioning.provision_ledger(control, data_dir, 999)
    u = _account(control)
    assert provisioning.open_ledger(control, data_dir, u["id"]) is None
    with pytest.raises(NoLedgerError):
        provisioning.require_ledger(control, u["id"])


# ---- adopting an existing single-owner database ---------------------------------------------------

def _legacy_ledger(path):
    conn = db.connect(path)
    user_service.bootstrap_owner(conn, name="Old Owner", email="Old@Example.com", timezone="UTC",
                                 home_currency_code="USD", password="old password", security_question_id=3,  # pragma: allowlist secret
                                 security_answer="Greenwood")  # pragma: allowlist secret
    conn.execute("INSERT INTO tag (name) VALUES ('kept')")
    conn.commit()
    conn.close()


def test_the_existing_owner_becomes_the_first_superuser_and_the_same_file_becomes_their_ledger(control, data_dir, tmp_path):
    legacy = tmp_path / "monetary.db"
    _legacy_ledger(legacy)
    before = legacy.stat().st_size

    account = provisioning.adopt_legacy_ledger(control, data_dir, legacy)

    assert (account["email"], account["name"], account["role"], account["status"]) == (
        "old@example.com", "Old Owner", "superuser", "active")
    assert (account["timezone"], account["home_currency_code"], account["security_question_id"]) == ("UTC", "USD", 3)
    ws = crepo.get_workspace_for_user(control, account["id"])
    assert tenant_store.resolve_db_path(data_dir, ws["db_path"]) == legacy.resolve()
    assert legacy.stat().st_size >= before and not (data_dir / "tenants").exists()
    # the old password still works, and the ledger data is the same file
    user, _token = acc.login(control, email="old@example.com", password="old password")  # pragma: allowlist secret
    ledger = provisioning.open_ledger(control, data_dir, user["id"])
    assert ledger.execute("SELECT name FROM tag").fetchone()["name"] == "kept"
    ledger.close()
    assert [r["action"] for r in crepo.list_audit(control)] == ["user.adopt_legacy_ledger"]


def test_adoption_runs_once_and_only_into_an_empty_control_database(control, data_dir, tmp_path):
    legacy = tmp_path / "monetary.db"
    _legacy_ledger(legacy)
    assert provisioning.adopt_legacy_ledger(control, data_dir, legacy) is not None
    assert provisioning.adopt_legacy_ledger(control, data_dir, legacy) is None
    assert crepo.count_users(control) == 1


def test_there_is_nothing_to_adopt_without_a_file_or_an_owner(control, data_dir, tmp_path):
    assert provisioning.adopt_legacy_ledger(control, data_dir, tmp_path / "missing.db") is None
    empty = tmp_path / "empty.db"
    db.connect(empty).close()
    assert provisioning.adopt_legacy_ledger(control, data_dir, empty) is None
    assert crepo.count_users(control) == 0


def test_a_ledger_owner_row_in_a_new_ledger_is_not_a_login(control, data_dir):
    u = _account(control)
    provisioning.provision_ledger(control, data_dir, u["id"])
    ledger = provisioning.open_ledger(control, data_dir, u["id"])
    with pytest.raises(sqlite3.IntegrityError):  # the ledger refuses a second owner with the same email
        ledger.execute("INSERT INTO user (name, email, is_superuser, created_at, updated_at) VALUES ('x', ?, 1, 't', 't')",
                       (u["email"],))
    ledger.close()
