"""Central project metadata and runtime configuration.

Change the values in this module when the product name or runtime namespace
changes. Code should import these constants instead of duplicating them.
"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_NAME = "Duevia"
PACKAGE_NAME = "duevia"
CLI_NAME = "duevia"
VERSION = "0.5.0"
API_VERSION = "v0.5"
API_PREFIX = f"/api/{API_VERSION}"

DB_ENV_VAR = "DUEVIA_DB_PATH"
CORS_ENV_VAR = "DUEVIA_CORS_ORIGINS"
DEFAULT_DB_PATH = Path.home() / ".duevia_0.5" / "expense.db"


def database_path_from_environment() -> str | None:
    """Return the configured database path, or None for the default path."""
    return os.environ.get(DB_ENV_VAR)


def cors_origins_from_environment() -> str:
    """Return the configured comma-separated CORS origins."""
    return os.environ.get(CORS_ENV_VAR, "*")
