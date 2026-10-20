"""Central project metadata and runtime configuration.

Change the values in this module when the product name or runtime namespace
changes. Code should import these constants instead of duplicating them.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------- #
# Product identity. The user-facing name is configuration, not code: set
# MONETARY_APP_NAME to rebrand every backend surface (OpenAPI title, root
# response, /meta consumed by the web app) without touching source.
# --------------------------------------------------------------------------- #
DEFAULT_APP_NAME = "Monetary"
DEFAULT_APP_TAGLINE = "Personal expense ledger"
PACKAGE_NAME = "monetary"
VERSION = "0.5.0"
API_VERSION = "v0.5"
API_PREFIX = f"/api/{API_VERSION}"

# --------------------------------------------------------------------------- #
# Environment variables. Every setting is read from `MONETARY_*`. The project
# was previously called "Duevia" and its deployments set `DUEVIA_*`; those
# names are still honoured as a fallback so an existing deployment keeps
# working after upgrading. When both are set, `MONETARY_*` wins.
# --------------------------------------------------------------------------- #
ENV_PREFIX = "MONETARY_"
LEGACY_ENV_PREFIX = "DUEVIA_"

APP_NAME_ENV_VAR = "MONETARY_APP_NAME"
APP_TAGLINE_ENV_VAR = "MONETARY_APP_TAGLINE"
SEED_DEFAULTS_ENV_VAR = "MONETARY_SEED_DEFAULTS_PATH"
DB_ENV_VAR = "MONETARY_DB_PATH"
CORS_ENV_VAR = "MONETARY_CORS_ORIGINS"
ENV_ENV_VAR = "MONETARY_ENV"
DOCS_ENV_VAR = "MONETARY_ENABLE_DOCS"

# The default database location is a *persisted* path that existing installs
# already use, so it keeps its original name. Changing it would silently
# orphan an existing database; point `MONETARY_DB_PATH` elsewhere to relocate.
DEFAULT_DB_PATH = Path.home() / ".duevia_0.5" / "expense.db"


def legacy_env_var(name: str) -> str:
    """The pre-rename (`DUEVIA_*`) spelling of a `MONETARY_*` variable name."""
    return LEGACY_ENV_PREFIX + name.removeprefix(ENV_PREFIX)


def read_env(name: str) -> str | None:
    """Value of the `MONETARY_*` variable `name`, falling back to its legacy
    `DUEVIA_*` spelling; None when neither is set."""
    value = os.environ.get(name)
    if value is None:
        value = os.environ.get(legacy_env_var(name))
    return value


def app_name() -> str:
    """The configured user-facing product name (read per call, so it can be
    overridden in tests and picked up without a code change)."""
    return (read_env(APP_NAME_ENV_VAR) or "").strip() or DEFAULT_APP_NAME


def app_tagline() -> str:
    return (read_env(APP_TAGLINE_ENV_VAR) or "").strip() or DEFAULT_APP_TAGLINE


def seed_defaults_path_from_environment() -> str | None:
    """Optional path to a JSON file overriding the default categories /
    income sources created at first-run setup."""
    return read_env(SEED_DEFAULTS_ENV_VAR) or None


def database_path_from_environment() -> str | None:
    """Return the configured database path, or None for the default path."""
    return read_env(DB_ENV_VAR)


def cors_origins_from_environment() -> str:
    """Return the configured comma-separated CORS origins. Defaults to no
    allowed origins (safe default for production); local development should
    set MONETARY_CORS_ORIGINS explicitly (e.g. to http://localhost:8501)."""
    return read_env(CORS_ENV_VAR) or ""


def environment_name() -> str:
    """'production' (default, safest) or 'development'. Controls docs
    exposure and other environment-sensitive defaults."""
    value = read_env(ENV_ENV_VAR)
    return (value if value is not None else "production").strip().lower()


def docs_enabled_from_environment() -> bool:
    """Whether to expose /docs, /redoc, and /openapi.json. Defaults to on in
    development and off in production unless explicitly overridden."""
    override = read_env(DOCS_ENV_VAR)
    if override is not None:
        return override.strip().lower() in ("1", "true", "yes", "on")
    return environment_name() != "production"
