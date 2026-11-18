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
    assert "already in use" in capsys.readouterr().err


def test_password_from_environment_and_prompt(env, monkeypatch):
    monkeypatch.setenv("MONETARY_PASSWORD", "env-password-123")  # pragma: allowlist secret
    assert cli.main(["create-superuser", "--email", "e@example.com", "--name", "E"]) == 0
    monkeypatch.delenv("MONETARY_PASSWORD")
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
