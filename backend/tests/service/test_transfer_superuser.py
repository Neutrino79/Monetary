"""There is exactly one superuser; the role moves only through the command-line transfer."""
from __future__ import annotations

import pytest

from monetary.application import identity_service as acc
from monetary.domain.exceptions import ConflictError, NotFoundError, ValidationError
from monetary.infrastructure import control_repository as crepo

NOW = "2026-01-01T00:00:00+00:00"


def _account(control, email, role="user", status="active"):
    return crepo.create_user(control, email=email, name=email.split("@")[0], role=role, status=status, now=NOW,
                             password_hash=acc.hash_password("correct horse"))  # pragma: allowlist secret


def _roles(control):
    return {u["email"]: u["role"] for u in crepo.list_users(control, limit=100)}


def test_the_role_moves_and_the_old_superuser_becomes_an_admin(control):
    old, new = _account(control, "old@example.com", "superuser"), _account(control, "new@example.com", "admin")
    token = acc.login(control, email="old@example.com", password="correct horse")[1]  # pragma: allowlist secret
    result = acc.transfer_superuser(control, to_email="NEW@example.com")
    assert result["role"] == "superuser"
    assert _roles(control) == {"old@example.com": "admin", "new@example.com": "superuser"}
    assert acc.verify_session(control, token) is None  # both sides sign in again
    entry = next(a for a in crepo.list_audit(control) if a["action"] == "user.transfer_superuser")
    assert entry["target_user_id"] == new["id"] and "old@example.com" in entry["detail"]
    assert old["id"] != new["id"]


def test_the_old_superuser_can_become_an_ordinary_user_instead(control):
    _account(control, "old@example.com", "superuser")
    _account(control, "new@example.com")
    acc.transfer_superuser(control, to_email="new@example.com", demote_to="user")
    assert _roles(control)["old@example.com"] == "user"


def test_a_lost_superuser_can_be_replaced_when_none_is_left(control):
    _account(control, "only@example.com")
    acc.transfer_superuser(control, to_email="only@example.com")
    assert _roles(control) == {"only@example.com": "superuser"}


def test_refusals(control):
    _account(control, "boss@example.com", "superuser")
    _account(control, "waiting@example.com", status="pending_approval")
    _account(control, "ok@example.com")
    with pytest.raises(NotFoundError):
        acc.transfer_superuser(control, to_email="ghost@example.com")
    with pytest.raises(ConflictError, match="Only an active account"):
        acc.transfer_superuser(control, to_email="waiting@example.com")
    with pytest.raises(ConflictError, match="already the superuser"):
        acc.transfer_superuser(control, to_email="boss@example.com")
    with pytest.raises(ValidationError):
        acc.transfer_superuser(control, to_email="ok@example.com", demote_to="superuser")
    assert _roles(control)["boss@example.com"] == "superuser"


def test_the_database_itself_refuses_a_second_superuser(control):
    import sqlite3
    _account(control, "boss@example.com", "superuser")
    with pytest.raises(sqlite3.IntegrityError):
        _account(control, "boss2@example.com", "superuser")
    other = _account(control, "other@example.com", "admin")
    with pytest.raises(sqlite3.IntegrityError):
        crepo.update_user(control, other["id"], now=NOW, role="superuser")
