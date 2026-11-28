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
def _settings_and_contacts(conn: sqlite3.Connection) -> None:
    """Ledger configuration stops living on a person.

    * `ledger_settings` (one row) takes the owner's timezone, home currency and ledger mode.
    * `contact` takes the friends. Ids are kept, so every friend's DUE account still points at the same
      person. A contact can later be linked to a platform account (`linked_user_id`, no foreign key
      because that account lives in another database).
    * `account.counterparty_user_id` becomes `counterparty_id` referencing `contact`.
    * The owner row, its credentials and the old `session` table go: sign-in belongs to the control
      database, and the owner's name and email are the account's, not the ledger's.
    """
    owner = conn.execute("SELECT * FROM user WHERE is_superuser = 1 ORDER BY id LIMIT 1").fetchone()
    conn.execute("""CREATE TABLE ledger_settings (
        id                  INTEGER PRIMARY KEY CHECK (id = 1),
        timezone            TEXT,
        home_currency_code  TEXT NOT NULL,
        ledger_mode         TEXT NOT NULL DEFAULT 'DIRECT' CHECK(ledger_mode IN ('STRICT','DIRECT')),
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
    )""")
    if owner is not None:
        conn.execute(
            "INSERT INTO ledger_settings (id, timezone, home_currency_code, ledger_mode, created_at, updated_at) "
            "VALUES (1, ?, ?, ?, ?, ?)",
            (owner["timezone"], owner["home_currency_code"] or "INR", owner["ledger_mode"],
             owner["created_at"], owner["updated_at"]))

    conn.execute("""CREATE TABLE contact (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        email           TEXT NOT NULL UNIQUE,
        phone           TEXT,
        linked_user_id  INTEGER,   -- platform account this contact is linked to (future); NULL = local only
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
    )""")
    conn.execute(
        "INSERT INTO contact (id, name, email, phone, created_at, updated_at) "
        "SELECT id, name, email, phone, created_at, updated_at FROM user "
        "WHERE is_superuser = 0 OR id IN (SELECT counterparty_user_id FROM account "
        "                                 WHERE counterparty_user_id IS NOT NULL)")
    seq = conn.execute("SELECT seq FROM sqlite_sequence WHERE name = 'user'").fetchone()
    if seq is not None:  # keep handing out fresh ids, never one a deleted friend used
        if conn.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'contact'", (seq[0],)).rowcount == 0:
            conn.execute("INSERT INTO sqlite_sequence (name, seq) VALUES ('contact', ?)", (seq[0],))

    conn.execute("""CREATE TABLE account_new (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        name                    TEXT NOT NULL,
        account_type            TEXT NOT NULL CHECK(account_type IN
                                    ('ASSET','LIABILITY','EXPENSE','INCOME','DUE','EQUITY')),
        currency_code           TEXT,
        parent_account_id       INTEGER REFERENCES account(id),
        budget_limit            INTEGER,
        subtype                 TEXT CHECK(subtype IS NULL OR subtype IN ('bank','cash','wallet','credit_card')),
        credit_limit            INTEGER CHECK(credit_limit IS NULL OR credit_limit >= 0),
        statement_day           INTEGER CHECK(statement_day IS NULL OR (statement_day BETWEEN 1 AND 31)),
        color                   TEXT,
        counterparty_id         INTEGER REFERENCES contact(id),
        is_system               INTEGER NOT NULL DEFAULT 0,
        is_active               INTEGER NOT NULL DEFAULT 1,
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL
    )""")
    conn.execute(
        "INSERT INTO account_new (id, name, account_type, currency_code, parent_account_id, budget_limit, "
        "subtype, credit_limit, statement_day, color, counterparty_id, is_system, is_active, created_at, "
        "updated_at) SELECT id, name, account_type, currency_code, parent_account_id, budget_limit, "
        "subtype, credit_limit, statement_day, color, counterparty_user_id, is_system, is_active, "
        "created_at, updated_at FROM account")
    seq = conn.execute("SELECT seq FROM sqlite_sequence WHERE name = 'account'").fetchone()
    conn.execute("DROP TABLE account")
    conn.execute("ALTER TABLE account_new RENAME TO account")
    if seq is not None:
        conn.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'account'", (seq[0],))
    conn.execute("CREATE INDEX idx_account_type         ON account(account_type)")
    conn.execute("CREATE INDEX idx_account_parent       ON account(parent_account_id)")
    conn.execute("CREATE INDEX idx_account_counterparty ON account(counterparty_id)")

    conn.execute("DROP TABLE session")
    conn.execute("DROP TABLE user")


BILL_SETTLEMENTS_SQL = """
ALTER TABLE journal_entry ADD COLUMN settles_entry_id INTEGER REFERENCES journal_entry(id);
ALTER TABLE journal_entry ADD COLUMN payment_group TEXT;
CREATE INDEX idx_entry_settles ON journal_entry(settles_entry_id);

CREATE TABLE bill_match (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    owed_to_me_entry_id    INTEGER NOT NULL REFERENCES journal_entry(id),  -- a SPLIT: the friend owes you
    owed_by_me_entry_id    INTEGER NOT NULL REFERENCES journal_entry(id),  -- a FRONTED: you owe the friend
    friend_due_account_id  INTEGER NOT NULL REFERENCES account(id),
    amount                 INTEGER NOT NULL CHECK(amount > 0),
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL,
    UNIQUE(owed_to_me_entry_id, owed_by_me_entry_id, friend_due_account_id)
);
CREATE INDEX idx_match_to_me ON bill_match(owed_to_me_entry_id);
CREATE INDEX idx_match_by_me ON bill_match(owed_by_me_entry_id);
CREATE INDEX idx_match_friend ON bill_match(friend_due_account_id);
"""

TENANT_MIGRATIONS: list[migrations.Migration] = [
    migrations.Migration(1, "baseline ledger schema", sql=SCHEMA),
    migrations.Migration(2, "ledger settings and contacts replace the owner row", fn=_settings_and_contacts,
                         rebuilds_tables=True),
    # Settlements are tied to the bill they pay (`settles_entry_id`, grouped by `payment_group`), and a bill
    # you owe a friend can be matched against a bill they owe you (`bill_match`, no ledger effect). Existing
    # settlements keep both columns empty: they are "unassigned payments" the owner links by hand.
    migrations.Migration(3, "settlements are tied to bills; bill matches", sql=BILL_SETTLEMENTS_SQL),
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
