"""Central project metadata and runtime configuration.

Change the values in this module when the product name or runtime namespace
changes. Code should import these constants instead of duplicating them.
"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_NAME = "Duevia"
PACKAGE_NAME = "duevia"
VERSION = "0.5.0"
API_VERSION = "v0.5"
API_PREFIX = f"/api/{API_VERSION}"

DB_ENV_VAR = "DUEVIA_DB_PATH"
CORS_ENV_VAR = "DUEVIA_CORS_ORIGINS"
ENV_ENV_VAR = "DUEVIA_ENV"
DOCS_ENV_VAR = "DUEVIA_ENABLE_DOCS"
DEFAULT_DB_PATH = Path.home() / ".duevia_0.5" / "expense.db"


def database_path_from_environment() -> str | None:
    """Return the configured database path, or None for the default path."""
    return os.environ.get(DB_ENV_VAR)


def cors_origins_from_environment() -> str:
    """Return the configured comma-separated CORS origins. Defaults to no
    allowed origins (safe default for production); local development should
    set DUEVIA_CORS_ORIGINS explicitly (e.g. to http://localhost:8501)."""
    return os.environ.get(CORS_ENV_VAR, "")


def environment_name() -> str:
    """'production' (default, safest) or 'development'. Controls docs
    exposure and other environment-sensitive defaults."""
    return os.environ.get(ENV_ENV_VAR, "production").strip().lower()


def docs_enabled_from_environment() -> bool:
    """Whether to expose /docs, /redoc, and /openapi.json. Defaults to on in
    development and off in production unless explicitly overridden."""
    override = os.environ.get(DOCS_ENV_VAR)
    if override is not None:
        return override.strip().lower() in ("1", "true", "yes", "on")
    return environment_name() != "production"
