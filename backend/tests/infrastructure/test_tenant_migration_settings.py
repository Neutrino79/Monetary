"""Ledger migration 2: the owner's settings move to `ledger_settings`, friends to `contact`."""
import sqlite3

from monetary.infrastructure import db
from tests.support.legacy_ledger import make_legacy_ledger


def _raw(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _tables(conn):
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_friends_keep_their_ids_and_their_due_accounts_and_postings(tmp_path):
    path = tmp_path / "ledger.db"
    make_legacy_ledger(path, friends=[("Rahul", "rahul@example.com"), ("Priya", "priya@example.com")])
    raw = _raw(path)
    before = {r["name"]: r["id"] for r in raw.execute("SELECT id, name FROM user WHERE is_superuser = 0")}
    due_before = {r["id"]: r["counterparty_user_id"] for r in raw.execute("SELECT * FROM account")}
    bank = raw.execute("INSERT INTO account (name, account_type, currency_code, created_at, updated_at) "
                       "VALUES ('Bank', 'ASSET', 'USD', 't', 't')").lastrowid
    entry = raw.execute("INSERT INTO journal_entry (description, entry_type, currency_code, entry_date, created_at, "
                        "updated_at) VALUES ('d', 'NORMAL', 'USD', '2026-01-01', 't', 't')").lastrowid
    due = next(iter(due_before))
    raw.execute("INSERT INTO posting (journal_entry_id, account_id, debit_amount, created_at, updated_at) "
                "VALUES (?, ?, 500, 't', 't')", (entry, due))
    raw.execute("INSERT INTO posting (journal_entry_id, account_id, credit_amount, created_at, updated_at) "
                "VALUES (?, ?, 500, 't', 't')", (entry, bank))
    raw.commit()
    raw.close()

    conn = db.connect(path)
    after = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM contact")}
    assert after == before
    assert {r["id"]: r["counterparty_id"] for r in conn.execute("SELECT * FROM account")} == {
        **{k: v for k, v in due_before.items()}, bank: None}
    assert conn.execute("SELECT COUNT(*) FROM posting").fetchone()[0] == 2
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert conn.execute("SELECT phone, linked_user_id FROM contact WHERE name = 'Rahul'").fetchone()[:] == ("555", None)
    conn.close()


def test_the_owner_row_credentials_and_sessions_are_gone_and_settings_are_kept(tmp_path):
    path = tmp_path / "ledger.db"
    make_legacy_ledger(path, timezone="Asia/Kolkata", currency="INR")
    conn = db.connect(path)
    assert not _tables(conn) & {"user", "session"}
    assert dict(conn.execute("SELECT timezone, home_currency_code, ledger_mode, created_at, updated_at "
                             "FROM ledger_settings").fetchone()) == {
        "timezone": "Asia/Kolkata", "home_currency_code": "INR", "ledger_mode": "STRICT",
        "created_at": "t0", "updated_at": "t1"}
    assert conn.execute("SELECT COUNT(*) FROM contact").fetchone()[0] == 0
    conn.close()


def test_ids_are_never_reused_after_the_upgrade(tmp_path):
    path = tmp_path / "ledger.db"
    make_legacy_ledger(path, friends=[("A", "a@example.com"), ("B", "b@example.com")])
    raw = _raw(path)
    highest = raw.execute("SELECT MAX(id) FROM user").fetchone()[0]
    raw.execute("DELETE FROM account WHERE counterparty_user_id = ?", (highest,))
    raw.execute("DELETE FROM user WHERE id = ?", (highest,))  # a friend deleted before the upgrade
    raw.commit()
    raw.close()
    conn = db.connect(path)
    new_contact = conn.execute("INSERT INTO contact (name, email, created_at, updated_at) "
                               "VALUES ('N', 'n@example.com', 't', 't')").lastrowid
    new_account = conn.execute("INSERT INTO account (name, account_type, currency_code, created_at, updated_at) "
                               "VALUES ('x', 'ASSET', 'USD', 't', 't')").lastrowid
    assert new_contact > highest and new_account > 2
    conn.close()


def test_a_database_with_no_owner_yet_upgrades_without_settings(tmp_path):
    path = tmp_path / "ledger.db"
    raw = _raw(path)
    raw.executescript(db.SCHEMA)
    raw.commit()
    raw.close()
    conn = db.connect(path)
    assert conn.execute("SELECT COUNT(*) FROM ledger_settings").fetchone()[0] == 0
    assert "contact" in _tables(conn)
    conn.close()


def test_the_owner_row_is_kept_as_a_contact_if_an_account_points_at_it(tmp_path):
    path = tmp_path / "ledger.db"
    make_legacy_ledger(path)
    raw = _raw(path)
    owner = raw.execute("SELECT id FROM user WHERE is_superuser = 1").fetchone()[0]
    raw.execute("INSERT INTO account (name, account_type, currency_code, counterparty_user_id, created_at, "
                "updated_at) VALUES ('odd', 'DUE', 'USD', ?, 't', 't')", (owner,))
    raw.commit()
    raw.close()
    conn = db.connect(path)  # must not fail the foreign key check
    assert conn.execute("SELECT COUNT(*) FROM contact").fetchone()[0] == 1
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    conn.close()


def test_a_fresh_ledger_has_the_new_shape(tmp_path):
    conn = db.connect(tmp_path / "new.db")
    assert {"ledger_settings", "contact", "account"} <= _tables(conn)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(account)")}
    assert "counterparty_id" in cols and "counterparty_user_id" not in cols
    assert conn.execute("SELECT name FROM sqlite_master WHERE name = 'idx_account_counterparty'").fetchone()
    conn.close()
