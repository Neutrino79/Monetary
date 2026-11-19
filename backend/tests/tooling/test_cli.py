from __future__ import annotations

import io

import pytest

from monetary import cli
from monetary.infrastructure import control_db, control_repository as crepo


@pytest.fixture()
def env(api_data_dir, monkeypatch):
    monkeypatch.delenv("MONETARY_PASSWORD", raising=False)
    return api_data_dir


def _create(monkeypatch, email="root@example.com", *extra):
    monkeypatch.setattr("sys.stdin", io.StringIO("root-password-123\n"))  # pragma: allowlist secret
    return cli.main(["create-superuser", "--email", email, "--name", "Root", "--password-stdin", *extra])


def test_create_superuser_with_ledger(env, monkeypatch, capsys):
    assert _create(monkeypatch) == 0
    assert "Created superuser root@example.com" in capsys.readouterr().out
    control = control_db.connect_control(env)
    user = crepo.get_user_by_email(control, "root@example.com")
    assert (user["role"], user["status"]) == ("superuser", "active")
    assert crepo.get_workspace_for_user(control, user["id"]) is not None
    control.close()


def test_create_superuser_without_ledger_and_duplicates(env, monkeypatch, capsys):
    assert _create(monkeypatch, "a@example.com", "--no-ledger") == 0
    control = control_db.connect_control(env)
    assert crepo.get_workspace_for_user(control, crepo.get_user_by_email(control, "a@example.com")["id"]) is None
    control.close()
    assert _create(monkeypatch, "a@example.com") == 1
    assert "A superuser already exists" in capsys.readouterr().err  # there is only ever one


def test_password_from_environment_and_prompt(env, monkeypatch, tmp_path):
    monkeypatch.setenv("MONETARY_PASSWORD", "env-password-123")  # pragma: allowlist secret
    assert cli.main(["create-superuser", "--email", "e@example.com", "--name", "E"]) == 0
    monkeypatch.delenv("MONETARY_PASSWORD")
    monkeypatch.setenv("MONETARY_DATA_DIR", str(tmp_path / "second-installation"))  # one superuser per installation
    answers = iter(["prompt-password-1", "prompt-password-1"])  # pragma: allowlist secret
    monkeypatch.setattr("getpass.getpass", lambda _p: next(answers))
    assert cli.main(["create-superuser", "--email", "p@example.com", "--name", "P"]) == 0
    mismatch = iter(["one-password-123", "two-password-123"])  # pragma: allowlist secret
    monkeypatch.setattr("getpass.getpass", lambda _p: next(mismatch))
    with pytest.raises(SystemExit, match="do not match"):
        cli.main(["create-superuser", "--email", "m@example.com", "--name", "M"])


def test_list_reset_and_migrate(env, monkeypatch, capsys):
    _create(monkeypatch)
    capsys.readouterr()
    assert cli.main(["list-users"]) == 0
    assert "root@example.com" in capsys.readouterr().out
    assert cli.main(["reset-password", "--email", "root@example.com"]) == 0
    out = capsys.readouterr().out
    assert "Temporary password for root@example.com:" in out
    assert cli.main(["reset-password", "--email", "nobody@example.com"]) == 1
    assert cli.main(["migrate-all"]) == 0
    assert "1 ledger(s) are up to date" in capsys.readouterr().out


def test_unlock_lifts_a_sign_in_lock(env, monkeypatch, capsys):
    _create(monkeypatch)
    control = control_db.connect_control(env)
    user = crepo.get_user_by_email(control, "root@example.com")
    crepo.update_user(control, user["id"], now="2026-01-01T00:00:00+00:00", failed_login_count=2,
                      locked_until="2999-01-01T00:00:00+00:00")
    control.commit()
    control.close()
    assert cli.main(["unlock", "--email", "root@example.com"]) == 0
    assert "Unlocked root@example.com" in capsys.readouterr().out
    control = control_db.connect_control(env)
    assert crepo.get_user(control, user["id"])["locked_until"] is None
    control.close()
    assert cli.main(["unlock", "--email", "nobody@example.com"]) == 1


def test_transfer_superuser_hands_the_role_over(env, monkeypatch, capsys):
    _create(monkeypatch)
    control = control_db.connect_control(env)
    crepo.create_user(control, email="next@example.com", name="Next", role="admin", status="active",
                      now="2026-01-01T00:00:00+00:00", password_hash=None)
    control.commit()
    control.close()
    assert cli.main(["transfer-superuser", "--to", "next@example.com"]) == 0
    assert "next@example.com is now the superuser" in capsys.readouterr().out
    control = control_db.connect_control(env)
    assert {u["email"]: u["role"] for u in crepo.list_users(control)} == {
        "next@example.com": "superuser", "root@example.com": "admin"}
    control.close()
    assert cli.main(["transfer-superuser", "--to", "nobody@example.com"]) == 1


def test_purge_backup_and_usage(env, monkeypatch, capsys, tmp_path):
    from monetary.application import admin_service

    _create(monkeypatch)
    control = control_db.connect_control(env)
    user, _ = admin_service.create_user(control, env, {"id": None, "role": "superuser"}, name="Ravi", email="ravi@example.com",
                                        timezone="UTC", home_currency_code="INR")
    admin_service.delete(control, {"id": None, "role": "superuser"}, user["id"])
    crepo.update_user(control, user["id"], now="2020-01-01T00:00:00+00:00", delete_after="2020-01-01T00:00:00+00:00")
    control.commit()
    control.close()
    capsys.readouterr()

    assert cli.main(["usage"]) == 0
    assert "2 ledger(s)" in capsys.readouterr().out
    assert cli.main(["backup", "--to", str(tmp_path / "bk")]) == 0
    assert "2 ledger(s)" in capsys.readouterr().out
    assert (tmp_path / "bk" / "control.db").exists()

    assert cli.main(["purge", "--dry-run"]) == 0
    assert "Would purge 1 account(s): ravi@example.com" in capsys.readouterr().out
    control = control_db.connect_control(env)
    assert crepo.get_user_by_email(control, "ravi@example.com") is not None  # a dry run changes nothing
    control.close()

    assert cli.main(["purge"]) == 0
    assert "Purged 1 account(s)" in capsys.readouterr().out
    control = control_db.connect_control(env)
    assert crepo.get_user_by_email(control, "ravi@example.com") is None
    control.close()
    assert cli.main(["usage"]) == 0
    assert "1 ledger(s)" in capsys.readouterr().out
