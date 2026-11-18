"""Consistent copies of SQLite databases (the online backup API, safe while the service is running).

A plain file copy of a WAL-mode database can miss committed data or capture a torn state; the backup
API copies a consistent snapshot. All SQL for backups and exports lives here.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path


def copy_database(source: sqlite3.Connection, destination: str | Path) -> Path:
    """Write a consistent snapshot of `source` to a new file at `destination` (replacing any old one)."""
    if source.in_transaction:
        # SQLite's backup waits forever for the write lock this very connection holds. Failing loudly
        # beats hanging: the caller must commit (or roll back) first.
        raise RuntimeError("Commit or roll back before taking a backup of this connection.")
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)
    target = sqlite3.connect(destination)
    try:
        source.backup(target)
    finally:
        target.close()
    return destination


def make_control_portable(control_copy: str | Path) -> None:
    """In a backup copy of the control database, point every ledger at `<public_id>.db` inside
    `tenants/`, so the backup restores as one folder even when the live ledger was an adopted file
    elsewhere. Sessions are dropped: nobody should be signed in on a restored copy."""
    conn = sqlite3.connect(control_copy)
    try:
        conn.execute("UPDATE workspace SET db_path = public_id || '.db'")
        conn.execute("DELETE FROM session")
        conn.commit()
    finally:
        conn.close()


def scrub_credentials(ledger_copy: str | Path) -> None:
    """Remove password hashes, security answers and sessions from an exported ledger copy. A user's
    own export contains their data, not the material that guards their account."""
    conn = sqlite3.connect(ledger_copy)
    try:
        conn.execute("DELETE FROM session")
        conn.execute("UPDATE user SET password_hash = NULL, security_question_id = NULL, security_answer_hash = NULL")
        conn.commit()
        conn.execute("VACUUM")  # drop the removed values from the file's free pages, too
    finally:
        conn.close()
