"""Reading the owner out of a ledger file written before multi-tenant support.

Those files kept the owner's sign-in details in their own `user` table. A later ledger migration removes
that row, so adoption has to read it from the raw file *before* the file is opened normally (which
upgrades it)."""

from __future__ import annotations

import sqlite3
from pathlib import Path


def read_owner(path: str | Path) -> dict | None:
    """The owner row of a pre-multi-tenant ledger, or None when the file has none (a ledger that was
    already upgraded, an empty file, a database of another kind)."""
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        try:
            row = conn.execute("SELECT * FROM user WHERE is_superuser = 1 ORDER BY id LIMIT 1").fetchone()
        except sqlite3.OperationalError:
            return None
        return dict(row) if row is not None else None
    finally:
        conn.close()
