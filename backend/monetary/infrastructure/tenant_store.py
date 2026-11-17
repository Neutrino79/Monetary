"""Where each user's ledger database lives on disk.

A ledger database is a SQLite file named after a random identifier, never after anything a user typed.
Paths stored in the control database are either *relative* (a file inside the tenants directory) or
*absolute* (an existing legacy ledger file that was adopted in place). Resolving a relative path is
confined to the tenants directory, so a corrupted or malicious value cannot point elsewhere.
"""

from __future__ import annotations

import re
import secrets
from pathlib import Path

TENANTS_DIRNAME = "tenants"
_FILE_RE = re.compile(r"^[0-9a-f]{32}\.db$")


def tenants_dir(data_dir: str | Path) -> Path:
    return Path(data_dir) / TENANTS_DIRNAME


def new_public_id() -> str:
    """A fresh random identifier (32 hex characters) for a ledger database."""
    return secrets.token_hex(16)


def filename_for(public_id: str) -> str:
    name = f"{public_id}.db"
    if not _FILE_RE.match(name):
        raise ValueError("A ledger identifier is 32 lower-case hexadecimal characters.")
    return name


def resolve_db_path(data_dir: str | Path, stored_path: str) -> Path:
    """The real file for a `workspace.db_path` value.

    An absolute value is returned as-is (an adopted legacy file). A relative value must name a file
    directly inside the tenants directory."""
    candidate = Path(stored_path)
    if candidate.is_absolute():
        return candidate
    base = tenants_dir(data_dir).resolve()
    resolved = (base / candidate).resolve()
    if resolved.parent != base or not _FILE_RE.match(resolved.name):
        raise ValueError(f"Ledger path {stored_path!r} is outside the tenants directory.")
    return resolved
