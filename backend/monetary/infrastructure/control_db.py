"""The control database: accounts, logins, sessions, workspaces and the audit log.

It holds nothing from anyone's ledger. Each user's ledger is a separate SQLite file (a *tenant*
database, see `tenant_store.py` and docs/MULTI_TENANT.md); the `workspace` table says which file
belongs to which user.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from monetary.infrastructure import migrations
from monetary.infrastructure.db import open_connection

CONTROL_DB_FILENAME = "control.db"

CONTROL_SCHEMA = """
CREATE TABLE IF NOT EXISTS user (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- stored lower-case and trimmed
    name                  TEXT NOT NULL,
    password_hash         TEXT,                                   -- bcrypt; NULL = password login impossible
    security_question_id  INTEGER,                                -- optional for admin-created users
    security_answer_hash  TEXT,
    role                  TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','superuser')),
    status                TEXT NOT NULL CHECK(status IN
                              ('pending_approval','active','rejected','suspended','pending_delete')),
    status_reason         TEXT,                                   -- shown to the user when rejected / suspended
    must_change_password  INTEGER NOT NULL DEFAULT 0,
    timezone              TEXT,                                   -- profile used when the ledger is created
    home_currency_code    TEXT,
    plan                  TEXT NOT NULL DEFAULT 'manual',         -- placeholder for subscriptions
    access_until          TEXT,                                   -- placeholder for subscriptions
    delete_after          TEXT,                                   -- set while status = pending_delete
    last_login_at         TEXT,
    approved_at           TEXT,
    approved_by           INTEGER REFERENCES user(id) ON DELETE SET NULL,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id       TEXT NOT NULL UNIQUE,     -- random hex; also the ledger file name
    db_path         TEXT NOT NULL,            -- relative to the tenants dir, or absolute for an adopted legacy file
    schema_version  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership (
    workspace_id    INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'owner',
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS session (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,        -- the raw token is never stored
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (         -- append-only: nothing updates or deletes these rows
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    at               TEXT NOT NULL,
    actor_user_id    INTEGER REFERENCES user(id) ON DELETE SET NULL,
    action           TEXT NOT NULL,            -- e.g. 'user.approve'
    target_user_id   INTEGER REFERENCES user(id) ON DELETE SET NULL,
    detail           TEXT,                     -- small JSON object, never secrets
    ip               TEXT
);

CREATE INDEX IF NOT EXISTS idx_cuser_status        ON user(status);
CREATE INDEX IF NOT EXISTS idx_cuser_role          ON user(role);
CREATE INDEX IF NOT EXISTS idx_membership_user     ON membership(user_id);
CREATE INDEX IF NOT EXISTS idx_csession_user       ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_csession_expires    ON session(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_at            ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_target        ON audit_log(target_user_id);
"""

CONTROL_MIGRATIONS: list[migrations.Migration] = [
    migrations.Migration(1, "baseline control schema", sql=CONTROL_SCHEMA),
]


def connect_control(data_dir: str | Path) -> sqlite3.Connection:
    """Open (creating and upgrading as needed) `<data dir>/control.db`."""
    conn = open_connection(Path(data_dir) / CONTROL_DB_FILENAME)
    migrations.migrate(conn, CONTROL_MIGRATIONS)
    return conn
