"""SQLite persistence bootstrap for the double-entry ledger schema."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from monetary.config import DEFAULT_DB_PATH
from monetary.infrastructure import migrations

SCHEMA = """
CREATE TABLE IF NOT EXISTS user (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name                    TEXT NOT NULL,
    email                   TEXT NOT NULL UNIQUE,
    phone                   TEXT,      -- friends only; optional contact detail
    is_superuser            INTEGER NOT NULL DEFAULT 0,
    timezone                TEXT,
    home_currency_code      TEXT,
    ledger_mode             TEXT NOT NULL DEFAULT 'DIRECT' CHECK(ledger_mode IN ('STRICT','DIRECT')),
    password_hash           TEXT,      -- bcrypt hash; NULL for friends (only the owner logs in)
    security_question_id    INTEGER,   -- 1-5, see domain/security.py::SECURITY_QUESTIONS
    security_answer_hash    TEXT,      -- bcrypt hash of the normalized answer
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id        INTEGER NOT NULL REFERENCES user(id),
    token_hash      TEXT NOT NULL UNIQUE,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name                    TEXT NOT NULL,
    account_type            TEXT NOT NULL CHECK(account_type IN
                                ('ASSET','LIABILITY','EXPENSE','INCOME','DUE','EQUITY')),
    currency_code           TEXT,                       -- NULL only for EQUITY (app-enforced)
    parent_account_id       INTEGER REFERENCES account(id),
    budget_limit            INTEGER,
    subtype                 TEXT CHECK(subtype IS NULL OR subtype IN ('bank','cash','wallet','credit_card')),
    credit_limit            INTEGER CHECK(credit_limit IS NULL OR credit_limit >= 0),  -- LIABILITY only (app-enforced)
    statement_day           INTEGER CHECK(statement_day IS NULL OR (statement_day BETWEEN 1 AND 31)),  -- LIABILITY only
    color                   TEXT,                       -- categories: UI colour chosen by the user
    counterparty_user_id    INTEGER REFERENCES user(id),
    is_system               INTEGER NOT NULL DEFAULT 0,
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_entry (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    description        TEXT NOT NULL,
    memo               TEXT,
    entry_type         TEXT NOT NULL CHECK(entry_type IN
                            ('NORMAL','SPLIT','FRONTED','REFUND','TRANSFER','ADJUSTMENT',
                             'SETTLEMENT','REVERSAL')),
    currency_code      TEXT NOT NULL,
    entry_date         TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','REVERSED')),
    category_id        INTEGER REFERENCES account(id),  -- NULL for TRANSFER/ADJUSTMENT/SETTLEMENT;
                                                          -- stored directly (not derived from
                                                          -- postings) because a SPLIT with a zero
                                                          -- owner share has no expense-account
                                                          -- posting to derive it from
    reversal_of_id     INTEGER REFERENCES journal_entry(id),
    reversed_by_id     INTEGER REFERENCES journal_entry(id),
    refund_of_id       INTEGER REFERENCES journal_entry(id),
    correction_of_id   INTEGER REFERENCES journal_entry(id),  -- STRICT mode: the entry this one replaces
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posting (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_entry_id   INTEGER NOT NULL REFERENCES journal_entry(id),
    account_id         INTEGER NOT NULL REFERENCES account(id),
    debit_amount       INTEGER NOT NULL DEFAULT 0 CHECK(debit_amount >= 0),
    credit_amount      INTEGER NOT NULL DEFAULT 0 CHECK(credit_amount >= 0),
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    CHECK ( (debit_amount > 0 AND credit_amount = 0)
         OR (credit_amount > 0 AND debit_amount = 0) )
);

CREATE TABLE IF NOT EXISTS tag (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL UNIQUE          -- normalised: trimmed, lowercase, single spaces (domain/tags.py)
);

CREATE TABLE IF NOT EXISTS entry_tag (
    journal_entry_id   INTEGER NOT NULL REFERENCES journal_entry(id) ON DELETE CASCADE,
    tag_id             INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (journal_entry_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_account_type          ON account(account_type);
CREATE INDEX IF NOT EXISTS idx_account_parent         ON account(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_account_counterparty   ON account(counterparty_user_id);
CREATE INDEX IF NOT EXISTS idx_entry_date             ON journal_entry(entry_date);
CREATE INDEX IF NOT EXISTS idx_entry_status           ON journal_entry(status);
CREATE INDEX IF NOT EXISTS idx_entry_type             ON journal_entry(entry_type);
CREATE INDEX IF NOT EXISTS idx_entry_refund_of        ON journal_entry(refund_of_id);
CREATE INDEX IF NOT EXISTS idx_entry_category         ON journal_entry(category_id);
CREATE INDEX IF NOT EXISTS idx_posting_entry          ON posting(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_posting_account        ON posting(account_id);
CREATE INDEX IF NOT EXISTS idx_entry_tag_tag           ON entry_tag(tag_id);
CREATE INDEX IF NOT EXISTS idx_session_owner          ON session(owner_id);
CREATE INDEX IF NOT EXISTS idx_session_expires        ON session(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_token_hash     ON session(token_hash);
"""


# Schema history of a ledger (tenant) database. Version 1 is the schema as it was before migrations
# existed; every statement is IF NOT EXISTS, so a database created by an older release (stored version
# 0) is adopted as-is. Add later changes as new numbered entries; never edit an existing one.
TENANT_MIGRATIONS: list[migrations.Migration] = [
    migrations.Migration(1, "baseline ledger schema", sql=SCHEMA),
]


def open_connection(path: Path) -> sqlite3.Connection:
    """Open a SQLite file with this project's connection settings (no schema work)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # FastAPI resolves the per-request connection dependency and runs a sync
    # endpoint in *different* worker threads. sqlite3 refuses cross-thread use by
    # default, which surfaced as intermittent 500s under a real server (the
    # in-process TestClient never hits it). That is safe to disable here because a
    # connection belongs to exactly one request and is never used concurrently.
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    # WAL lets concurrent readers proceed while a request holds a write
    # transaction -- important once this is the only interface (API traffic
    # is concurrent by nature, unlike the old single-shot CLI process).
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    conn = open_connection(Path(db_path) if db_path else DEFAULT_DB_PATH)
    migrations.migrate(conn, TENANT_MIGRATIONS)
    return conn
