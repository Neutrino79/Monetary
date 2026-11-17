-- ============================================================================
-- CONTROL DATABASE (control.db): accounts, logins, workspaces, audit log.
-- One per deployment; every user's ledger is a separate file with the schema in LIVE_SCHEMA.sql.
-- Kept in its own file because it reuses the table names `user` and `session`.
-- Source: backend/monetary/infrastructure/control_db.py (see docs/MULTI_TENANT.md).
-- ============================================================================

-- schema version: PRAGMA user_version = 1 (ledger databases are also at version 1)

-- table: audit_log
CREATE TABLE audit_log (         -- append-only: nothing updates or deletes these rows
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    at               TEXT NOT NULL,
    actor_user_id    INTEGER REFERENCES user(id) ON DELETE SET NULL,
    action           TEXT NOT NULL,            -- e.g. 'user.approve'
    target_user_id   INTEGER REFERENCES user(id) ON DELETE SET NULL,
    detail           TEXT,                     -- small JSON object, never secrets
    ip               TEXT
);

-- table: membership
CREATE TABLE membership (
    workspace_id    INTEGER NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'owner',
    PRIMARY KEY (workspace_id, user_id)
);

-- table: session
CREATE TABLE session (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,        -- the raw token is never stored
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL
);

-- table: user
CREATE TABLE user (
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

-- table: workspace
CREATE TABLE workspace (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id       TEXT NOT NULL UNIQUE,     -- random hex; also the ledger file name
    db_path         TEXT NOT NULL,            -- relative to the tenants dir, or absolute for an adopted legacy file
    schema_version  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);

-- index: idx_audit_at
CREATE INDEX idx_audit_at            ON audit_log(at);

-- index: idx_audit_target
CREATE INDEX idx_audit_target        ON audit_log(target_user_id);

-- index: idx_csession_expires
CREATE INDEX idx_csession_expires    ON session(expires_at);

-- index: idx_csession_user
CREATE INDEX idx_csession_user       ON session(user_id);

-- index: idx_cuser_role
CREATE INDEX idx_cuser_role          ON user(role);

-- index: idx_cuser_status
CREATE INDEX idx_cuser_status        ON user(status);

-- index: idx_membership_user
CREATE INDEX idx_membership_user     ON membership(user_id);

