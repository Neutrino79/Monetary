"""Versioned schema migrations for the SQLite databases (the control database and every tenant ledger).

Each database records its schema version in ``PRAGMA user_version``. Opening a database runs every
migration newer than that version, inside one transaction, and then stores the new version, so a
database is always at a complete version, never half-upgraded.

Rules for writing a migration:
- Append to the list; never edit or reorder a released migration.
- Keep it compatible with the previous release for one release (add first, remove later).
- Give it a SQL script or a function ``fn(conn)``; do not commit inside it.
- A migration that rebuilds a table other tables point to (SQLite cannot alter a CHECK) sets
  ``rebuilds_tables=True``: the runner then turns foreign keys off around the upgrade, as the SQLite
  documentation prescribes, and verifies ``PRAGMA foreign_key_check`` is clean before committing.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Callable, Sequence


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    sql: str | None = None
    fn: Callable[[sqlite3.Connection], None] | None = None
    rebuilds_tables: bool = False

    def __post_init__(self) -> None:
        if self.version < 1:
            raise ValueError("Migration versions start at 1.")
        if (self.sql is None) == (self.fn is None):
            raise ValueError("A migration needs exactly one of `sql` or `fn`.")


def current_version(conn: sqlite3.Connection) -> int:
    return int(conn.execute("PRAGMA user_version").fetchone()[0])


def latest_version(migrations: Sequence[Migration]) -> int:
    return migrations[-1].version if migrations else 0


def validate(migrations: Sequence[Migration]) -> None:
    """Versions must be 1, 2, 3, ... in order with no gaps or repeats."""
    for expected, migration in enumerate(migrations, start=1):
        if migration.version != expected:
            raise ValueError(
                f"Migration {migration.name!r} has version {migration.version}, expected {expected}."
            )


def _run_script(conn: sqlite3.Connection, script: str) -> None:
    """Run a multi-statement script *inside the caller's transaction*.

    ``Connection.executescript`` commits first, which would break atomicity, so the script is split
    into complete statements here and executed one by one."""
    buffer = ""
    for line in script.splitlines(keepends=True):
        buffer += line
        if sqlite3.complete_statement(buffer):
            statement = buffer.strip()
            buffer = ""
            if statement:
                conn.execute(statement)
    if buffer.strip():
        raise ValueError("Migration script ends with an incomplete SQL statement.")


def migrate(conn: sqlite3.Connection, migrations: Sequence[Migration]) -> int:
    """Bring `conn` up to the latest version in `migrations`; return the version it is now at.

    Safe to call from several processes at once: the upgrade takes the write lock first and
    re-reads the version, so the second caller finds nothing left to do. A migration that raises
    rolls the whole upgrade back and leaves the version unchanged."""
    validate(migrations)
    target = latest_version(migrations)
    version = current_version(conn)
    if version > target:
        raise RuntimeError(
            f"The database is at schema version {version}, newer than this release understands "
            f"({target}). Upgrade the application."
        )
    if version == target:
        return version

    if conn.in_transaction:
        raise RuntimeError("migrate() must be called on a connection with no open transaction.")
    pending_rebuild = any(m.rebuilds_tables for m in migrations if m.version > version)
    foreign_keys_were_on = bool(conn.execute("PRAGMA foreign_keys").fetchone()[0])
    if pending_rebuild and foreign_keys_were_on:
        conn.execute("PRAGMA foreign_keys = OFF")  # has no effect inside a transaction, so before BEGIN
    try:
        conn.execute("BEGIN IMMEDIATE")
        try:
            version = current_version(conn)  # re-read under the write lock
            rebuilt = False
            for migration in migrations:
                if migration.version <= version:
                    continue
                if migration.sql is not None:
                    _run_script(conn, migration.sql)
                else:
                    migration.fn(conn)
                rebuilt = rebuilt or migration.rebuilds_tables
                version = migration.version
            if rebuilt:
                broken = conn.execute("PRAGMA foreign_key_check").fetchall()
                if broken:
                    raise RuntimeError(f"Migration left {len(broken)} broken foreign key reference(s).")
            conn.execute(f"PRAGMA user_version = {int(version)}")  # int() because PRAGMA cannot be parameterised
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
    finally:
        if pending_rebuild and foreign_keys_were_on:
            conn.execute("PRAGMA foreign_keys = ON")
    return version
