"""Migration 3 rebuilds the user table (SQLite cannot alter a CHECK): nothing may be lost on the way."""
from __future__ import annotations

import logging

from monetary.infrastructure import control_db, migrations


def _v2(tmp_path):
    conn = control_db.open_connection(tmp_path / "control.db")
    migrations.migrate(conn, control_db.CONTROL_MIGRATIONS[:2])
    return conn


def _user(conn, email, role="user", approved_by=None):
    conn.execute("INSERT INTO user (email, name, role, status, approved_by, created_at, updated_at) "
                 "VALUES (?, ?, ?, 'active', ?, 't', 't')", (email, email, role, approved_by))


def test_data_ids_links_and_foreign_keys_survive_the_rebuild(tmp_path):
    conn = _v2(tmp_path)
    _user(conn, "boss@example.com", "superuser")
    _user(conn, "sam@example.com", approved_by=1)
    _user(conn, "gone@example.com")
    conn.execute("DELETE FROM user WHERE email = 'gone@example.com'")  # leaves the id counter at 3
    conn.execute("INSERT INTO session (user_id, token_hash, created_at, expires_at) VALUES (2, 'h', 't', 't')")
    conn.execute("INSERT INTO workspace (public_id, db_path, created_at) VALUES ('p', 'p.db', 't')")
    conn.execute("INSERT INTO membership (workspace_id, user_id) VALUES (1, 2)")
    conn.execute("INSERT INTO audit_log (at, actor_user_id, target_user_id, action) VALUES ('t', 1, 2, 'x')")
    conn.commit()

    assert migrations.migrate(conn, control_db.CONTROL_MIGRATIONS) == 4

    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1  # restored after the rebuild
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert [r[0] for r in conn.execute("SELECT email FROM user ORDER BY id")] == ["boss@example.com", "sam@example.com"]
    assert conn.execute("SELECT approved_by FROM user WHERE id = 2").fetchone()[0] == 1
    assert conn.execute("SELECT user_id FROM session").fetchone()[0] == 2
    assert conn.execute("SELECT user_id FROM membership").fetchone()[0] == 2
    assert tuple(conn.execute("SELECT actor_user_id, target_user_id FROM audit_log").fetchone()) == (1, 2)
    _user(conn, "next@example.com", "admin")  # the admin role is allowed, and ids are not reused
    assert conn.execute("SELECT MAX(id) FROM user").fetchone()[0] == 4


def test_deleting_a_user_after_the_rebuild_still_cascades(tmp_path):
    conn = _v2(tmp_path)
    _user(conn, "sam@example.com")
    conn.execute("INSERT INTO session (user_id, token_hash, created_at, expires_at) VALUES (1, 'h', 't', 't')")
    conn.commit()
    migrations.migrate(conn, control_db.CONTROL_MIGRATIONS)
    conn.execute("DELETE FROM user WHERE id = 1")
    assert conn.execute("SELECT COUNT(*) FROM session").fetchone()[0] == 0


def test_an_installation_with_two_superusers_still_upgrades_with_a_warning(tmp_path, caplog):
    conn = _v2(tmp_path)
    _user(conn, "a@example.com", "superuser")
    _user(conn, "b@example.com", "superuser")
    conn.commit()
    with caplog.at_level(logging.WARNING, logger="monetary.migrations"):
        assert migrations.migrate(conn, control_db.CONTROL_MIGRATIONS) == 4
    assert "transfer-superuser" in caplog.text
    indexes = [r[1] for r in conn.execute("PRAGMA index_list('user')")]
    assert "uq_single_superuser" not in indexes
    assert conn.execute("SELECT COUNT(*) FROM user WHERE role = 'superuser'").fetchone()[0] == 2  # nothing is demoted silently


def test_a_failing_rebuild_changes_nothing(tmp_path, monkeypatch):
    conn = _v2(tmp_path)
    _user(conn, "sam@example.com")
    conn.commit()

    def broken(c):
        c.execute("ALTER TABLE user RENAME TO somewhere_else")
        raise RuntimeError("boom")

    patched = control_db.CONTROL_MIGRATIONS[:2] + [migrations.Migration(3, "x", fn=broken, rebuilds_tables=True)]
    try:
        migrations.migrate(conn, patched)
    except RuntimeError:
        pass
    assert migrations.current_version(conn) == 2
    assert conn.execute("SELECT COUNT(*) FROM user").fetchone()[0] == 1
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_migration_4_adds_session_details_and_keeps_existing_sessions(tmp_path):
    from monetary.infrastructure import control_db, control_repository as crepo, migrations
    conn = control_db.open_connection(tmp_path / "control.db")
    migrations.migrate(conn, control_db.CONTROL_MIGRATIONS[:3])
    user = crepo.create_user(conn, email="a@example.com", name="A", password_hash="x", role="user",
                             status="active", timezone=None, home_currency_code="INR", now="2026-01-01T00:00:00+00:00")
    conn.execute("INSERT INTO session (user_id, token_hash, created_at, expires_at) VALUES (?, 'h', 'a', 'b')",
                 (user["id"],))
    conn.commit()
    migrations.migrate(conn, control_db.CONTROL_MIGRATIONS)
    row = conn.execute("SELECT last_seen_at, ip, user_agent, token_hash FROM session").fetchone()
    assert tuple(row) == (None, None, None, "h")
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 4
