"""Control-database schema and repository behaviour."""
import sqlite3

import pytest

from monetary.infrastructure import control_db
from monetary.infrastructure import control_repository as crepo
from monetary.infrastructure import migrations as mig

NOW = "2026-01-01T00:00:00+00:00"


def _user(control, email="a@example.com", status="active", role="user", name="A", **kw):
    return crepo.create_user(control, email=email, name=name, password_hash="h", role=role, status=status,
                             now=kw.pop("now", NOW), **kw)


def test_the_control_database_is_versioned_and_created_in_the_data_dir(data_dir):
    conn = control_db.connect_control(data_dir)
    assert (data_dir / "control.db").is_file()
    assert mig.current_version(conn) == mig.latest_version(control_db.CONTROL_MIGRATIONS)
    conn.close()


def test_emails_are_unique_regardless_of_case(control):
    _user(control, email="Sam@Example.com")
    with pytest.raises(sqlite3.IntegrityError):
        _user(control, email="sam@example.com")
    assert crepo.get_user_by_email(control, "SAM@example.COM")["email"] == "Sam@Example.com"


def test_status_and_role_are_constrained(control):
    with pytest.raises(sqlite3.IntegrityError):
        _user(control, status="banana")
    with pytest.raises(sqlite3.IntegrityError):
        _user(control, email="b@example.com", role="root")


def test_update_user_changes_only_whitelisted_columns_and_bumps_updated_at(control):
    u = _user(control)
    updated = crepo.update_user(control, u["id"], now="2026-02-02T00:00:00+00:00",
                                status="suspended", status_reason="chargeback", must_change_password=True)
    assert (updated["status"], updated["status_reason"], updated["must_change_password"]) == ("suspended", "chargeback", 1)
    assert updated["updated_at"] == "2026-02-02T00:00:00+00:00" and updated["created_at"] == NOW
    with pytest.raises(ValueError):
        crepo.update_user(control, u["id"], now=NOW, email="x@example.com")
    with pytest.raises(ValueError):
        crepo.update_user(control, u["id"], now=NOW, id=99)


def test_listing_filters_by_status_and_search_and_pages(control):
    for i in range(5):
        _user(control, email=f"u{i}@example.com", name=f"User {i}", status="active" if i < 3 else "pending_approval",
              now=f"2026-01-0{i + 1}T00:00:00+00:00")
    assert crepo.count_users(control) == 5
    assert crepo.count_users(control, status="pending_approval") == 2
    assert [u["email"] for u in crepo.list_users(control, status="pending_approval")] == ["u4@example.com", "u3@example.com"]
    assert [u["email"] for u in crepo.list_users(control, limit=2, offset=1)] == ["u3@example.com", "u2@example.com"]
    assert [u["email"] for u in crepo.list_users(control, q="user 1")] == ["u1@example.com"]
    assert crepo.count_users_by_status(control) == {"active": 3, "pending_approval": 2}


def test_search_treats_percent_and_underscore_literally(control):
    _user(control, email="plain@example.com", name="Plain")
    _user(control, email="50%off@example.com", name="Fifty")
    assert [u["email"] for u in crepo.list_users(control, q="%")] == ["50%off@example.com"]
    assert crepo.list_users(control, q="_") == []


def test_counting_active_superusers_ignores_other_states_and_roles(control):
    _user(control, email="s1@example.com", role="superuser")
    _user(control, email="s2@example.com", role="superuser", status="suspended")
    _user(control, email="u@example.com")
    assert crepo.count_active_superusers(control) == 1


def test_stale_requests_are_removed_but_active_and_recent_ones_are_kept(control):
    _user(control, email="old-pending@example.com", status="pending_approval", now="2025-01-01T00:00:00+00:00")
    _user(control, email="new-pending@example.com", status="pending_approval", now="2026-06-01T00:00:00+00:00")
    _user(control, email="old-rejected@example.com", status="rejected", now="2025-01-01T00:00:00+00:00")
    _user(control, email="old-active@example.com", status="active", now="2025-01-01T00:00:00+00:00")
    removed = crepo.delete_stale_requests(control, pending_before="2026-01-01", rejected_before="2026-01-01")
    assert removed == 2
    assert {u["email"] for u in crepo.list_users(control)} == {"new-pending@example.com", "old-active@example.com"}


def test_sessions_are_stored_by_hash_and_can_be_revoked_per_user(control):
    u = _user(control)
    crepo.create_session(control, user_id=u["id"], token_hash="h1", created_at=NOW, expires_at="2099-01-01")
    crepo.create_session(control, user_id=u["id"], token_hash="h2", created_at=NOW, expires_at="2000-01-01")
    assert crepo.get_session_by_token_hash(control, "h1")["user_id"] == u["id"]
    crepo.delete_expired_sessions(control, "2026-01-01")
    assert crepo.get_session_by_token_hash(control, "h2") is None
    crepo.delete_sessions_for_user(control, u["id"])
    assert crepo.get_session_by_token_hash(control, "h1") is None


def test_a_user_has_at_most_the_workspace_they_are_a_member_of(control):
    a, b = _user(control, email="a@example.com"), _user(control, email="b@example.com")
    w = crepo.create_workspace(control, public_id="a" * 32, db_path="x.db", schema_version=1, now=NOW)
    crepo.add_membership(control, workspace_id=w["id"], user_id=a["id"])
    assert crepo.get_workspace_for_user(control, a["id"])["public_id"] == "a" * 32
    assert crepo.get_workspace_for_user(control, b["id"]) is None


def test_audit_rows_are_listed_newest_first_and_survive_user_deletion(control):
    u = _user(control)
    for action in ("one", "two", "three"):
        crepo.add_audit(control, at=NOW, actor_user_id=None, action=action, target_user_id=u["id"])
    assert [r["action"] for r in crepo.list_audit(control)] == ["three", "two", "one"]
    assert [r["action"] for r in crepo.list_audit(control, limit=1, offset=1)] == ["two"]
    assert crepo.count_audit(control) == 3
    assert len(crepo.list_audit(control, target_user_id=u["id"])) == 3
    control.execute("DELETE FROM user WHERE id = ?", (u["id"],))
    rows = crepo.list_audit(control)
    assert len(rows) == 3 and all(r["target_user_id"] is None for r in rows)
