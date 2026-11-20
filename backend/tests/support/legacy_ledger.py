"""A ledger file shaped like the ones written before multi-tenant support: it holds the owner's
sign-in details in its own `user` table. Built from the baseline schema, without later migrations."""
from __future__ import annotations

import sqlite3

from monetary.infrastructure import db


def make_legacy_ledger(path, *, name="Old Owner", email="old@example.com", timezone="UTC", currency="USD",
                       password_hash="legacy-hash", security_question_id=3,  # pragma: allowlist secret
                       security_answer_hash="answer-hash", friends=()) -> None:  # pragma: allowlist secret
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(db.SCHEMA)  # exactly what older releases created: no stored version
    conn.execute(
        "INSERT INTO user (name, email, is_superuser, timezone, home_currency_code, ledger_mode, password_hash, "
        "security_question_id, security_answer_hash, created_at, updated_at) VALUES (?,?,1,?,?,?,?,?,?,'t0','t1')",
        (name, email, timezone, currency, "STRICT", password_hash, security_question_id, security_answer_hash))
    owner_id = conn.execute("SELECT id FROM user").fetchone()["id"]
    conn.execute("INSERT INTO session (owner_id, token_hash, created_at, expires_at) VALUES (?, 'h', 'a', 'b')",
                 (owner_id,))
    for friend_name, friend_email in friends:
        cur = conn.execute("INSERT INTO user (name, email, phone, is_superuser, created_at, updated_at) "
                           "VALUES (?, ?, '555', 0, 't0', 't0')", (friend_name, friend_email))
        conn.execute(
            "INSERT INTO account (name, account_type, currency_code, counterparty_user_id, created_at, updated_at) "
            "VALUES (?, 'DUE', ?, ?, 't0', 't0')", (f"Due: {friend_name}", currency, cur.lastrowid))
    conn.commit()
    conn.close()
