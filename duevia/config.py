"""Central project metadata and runtime configuration.

Change the values in this module when the product name or runtime namespace
changes. Code should import these constants instead of duplicating them.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------- #
# Product identity. The user-facing name is configuration, not code: set
# DUEVIA_APP_NAME to rebrand every backend surface (OpenAPI title, root
# response, /meta consumed by the web app) without touching source. Internal
# identifiers (package name, env prefix, DB file) deliberately stay "duevia".
# --------------------------------------------------------------------------- #
DEFAULT_APP_NAME = "Monetary"
DEFAULT_APP_TAGLINE = "Personal expense ledger"
APP_NAME_ENV_VAR = "DUEVIA_APP_NAME"
APP_TAGLINE_ENV_VAR = "DUEVIA_APP_TAGLINE"
SEED_DEFAULTS_ENV_VAR = "DUEVIA_SEED_DEFAULTS_PATH"
PACKAGE_NAME = "duevia"
VERSION = "0.5.0"
API_VERSION = "v0.5"
API_PREFIX = f"/api/{API_VERSION}"

DB_ENV_VAR = "DUEVIA_DB_PATH"
CORS_ENV_VAR = "DUEVIA_CORS_ORIGINS"
ENV_ENV_VAR = "DUEVIA_ENV"
DOCS_ENV_VAR = "DUEVIA_ENABLE_DOCS"
DEFAULT_DB_PATH = Path.home() / ".duevia_0.5" / "expense.db"


def app_name() -> str:
    """The configured user-facing product name (read per call, so it can be
    overridden in tests and picked up without a code change)."""
    return os.environ.get(APP_NAME_ENV_VAR, "").strip() or DEFAULT_APP_NAME


def app_tagline() -> str:
    return os.environ.get(APP_TAGLINE_ENV_VAR, "").strip() or DEFAULT_APP_TAGLINE


def seed_defaults_path_from_environment() -> str | None:
    """Optional path to a JSON file overriding the default categories /
    income sources created at first-run setup."""
    return os.environ.get(SEED_DEFAULTS_ENV_VAR) or None


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
