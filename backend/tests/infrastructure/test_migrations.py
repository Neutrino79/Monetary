"""The migration runner: fresh databases, adopting a pre-migration database, atomicity, ordering."""
import sqlite3

import pytest

from monetary.infrastructure import db as db_module
from monetary.infrastructure import migrations as mig
from monetary.infrastructure.migrations import Migration


def _raw(path):
    c = sqlite3.connect(str(path))
    c.row_factory = sqlite3.Row
    return c


def test_a_fresh_ledger_database_is_at_the_latest_version(tmp_path):
    conn = db_module.connect(tmp_path / "a.db")
    assert mig.current_version(conn) == mig.latest_version(db_module.TENANT_MIGRATIONS)
    conn.close()


def test_a_database_made_before_migrations_existed_is_adopted_with_its_data(tmp_path):
    path = tmp_path / "legacy.db"
    legacy = _raw(path)
    legacy.executescript(db_module.SCHEMA)  # exactly what older releases created: no stored version
    legacy.execute(
        "INSERT INTO user (name, email, is_superuser, created_at, updated_at) VALUES (?,?,?,?,?)",
        ("Old Owner", "old@example.com", 1, "t", "t"),
    )
    legacy.commit()
    assert mig.current_version(legacy) == 0
    legacy.close()

    conn = db_module.connect(path)
    assert mig.current_version(conn) == 1
    assert conn.execute("SELECT email FROM user").fetchone()["email"] == "old@example.com"
    conn.close()


def test_opening_twice_is_a_no_op(tmp_path):
    db_module.connect(tmp_path / "b.db").close()
    conn = db_module.connect(tmp_path / "b.db")
    assert mig.current_version(conn) == 1
    conn.close()


def test_pending_migrations_run_in_order_and_store_the_version(tmp_path):
    conn = _raw(tmp_path / "c.db")
    steps = [
        Migration(1, "create", sql="CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT);"),
        Migration(2, "add column", sql="ALTER TABLE t ADD COLUMN b TEXT;"),
        Migration(3, "backfill", fn=lambda c: c.execute("INSERT INTO t (a, b) VALUES ('x', 'y')")),
    ]
    assert mig.migrate(conn, steps) == 3
    assert mig.current_version(conn) == 3
    assert conn.execute("SELECT a, b FROM t").fetchone()["b"] == "y"
    conn.close()


def test_only_newer_migrations_run_on_an_existing_database(tmp_path):
    conn = _raw(tmp_path / "d.db")
    first = [Migration(1, "create", sql="CREATE TABLE t (id INTEGER PRIMARY KEY);")]
    mig.migrate(conn, first)
    later = first + [Migration(2, "add", sql="ALTER TABLE t ADD COLUMN n INTEGER;")]
    assert mig.migrate(conn, later) == 2
    conn.close()


def test_a_failing_migration_rolls_everything_back(tmp_path):
    conn = _raw(tmp_path / "e.db")
    mig.migrate(conn, [Migration(1, "create", sql="CREATE TABLE t (id INTEGER PRIMARY KEY);")])
    broken = [
        Migration(1, "create", sql="CREATE TABLE t (id INTEGER PRIMARY KEY);"),
        Migration(2, "good then bad", sql="ALTER TABLE t ADD COLUMN n INTEGER; THIS IS NOT SQL;"),
    ]
    with pytest.raises(sqlite3.Error):
        mig.migrate(conn, broken)
    assert mig.current_version(conn) == 1
    assert "n" not in [r["name"] for r in conn.execute("PRAGMA table_info(t)")]
    conn.close()


def test_a_database_newer_than_the_release_is_refused(tmp_path):
    conn = _raw(tmp_path / "f.db")
    conn.execute("PRAGMA user_version = 9")
    with pytest.raises(RuntimeError, match="newer than this release"):
        mig.migrate(conn, [Migration(1, "create", sql="CREATE TABLE t (id INTEGER);")])
    conn.close()


def test_version_numbers_must_be_consecutive():
    with pytest.raises(ValueError):
        mig.validate([Migration(1, "a", sql="SELECT 1;"), Migration(3, "c", sql="SELECT 1;")])
    with pytest.raises(ValueError):
        Migration(0, "bad", sql="SELECT 1;")
    with pytest.raises(ValueError):
        Migration(1, "both", sql="SELECT 1;", fn=lambda c: None)


def test_a_script_cannot_end_in_the_middle_of_a_statement(tmp_path):
    conn = _raw(tmp_path / "g.db")
    with pytest.raises(ValueError, match="incomplete"):
        mig.migrate(conn, [Migration(1, "cut", sql="CREATE TABLE t (id INTEGER")])
    assert mig.current_version(conn) == 0
    conn.close()
