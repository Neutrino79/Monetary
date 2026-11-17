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
VERSION = "0.5.0"  # x-release-please-version
API_VERSION = "v0.5"
API_PREFIX = f"/api/{API_VERSION}"

# --------------------------------------------------------------------------- #
# Environment variables: every setting is read from `MONETARY_*`.
# --------------------------------------------------------------------------- #
APP_NAME_ENV_VAR = "MONETARY_APP_NAME"
APP_TAGLINE_ENV_VAR = "MONETARY_APP_TAGLINE"
SEED_DEFAULTS_ENV_VAR = "MONETARY_SEED_DEFAULTS_PATH"
DB_ENV_VAR = "MONETARY_DB_PATH"
DATA_DIR_ENV_VAR = "MONETARY_DATA_DIR"
CORS_ENV_VAR = "MONETARY_CORS_ORIGINS"
ENV_ENV_VAR = "MONETARY_ENV"
DOCS_ENV_VAR = "MONETARY_ENABLE_DOCS"
DEMO_ENV_VAR = "MONETARY_DEMO_MODE"
DEMO_RESET_ENV_VAR = "MONETARY_DEMO_RESET"

# Everything the service stores lives under one data directory: `control.db` (accounts and logins) and
# `tenants/` (one ledger database per user). The directory name carries the data generation.
DEFAULT_DATA_DIR = Path.home() / ".monetary_0.5"
# Before multi-tenant hosting the whole service was a single ledger file here; it is adopted in place
# as the first superuser's ledger on first start (see docs/MULTI_TENANT.md).
DEFAULT_DB_PATH = DEFAULT_DATA_DIR / "monetary.db"
# Demo mode keeps its control database and sample ledger in a separate directory next to the real one.
DEFAULT_DEMO_DATA_DIR = DEFAULT_DATA_DIR / "demo"


def read_env(name: str) -> str | None:
    """Value of the environment variable `name`, or None when unset."""
    return os.environ.get(name)


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


def demo_mode_enabled() -> bool:
    """Whether demo mode is on (MONETARY_DEMO_MODE=true). Off by default."""
    return (read_env(DEMO_ENV_VAR) or "").strip().lower() in ("1", "true", "yes", "on")


def demo_reset_on_start() -> bool:
    """Whether demo mode rebuilds the sample ledger from scratch at every start (MONETARY_DEMO_RESET=true)."""
    return (read_env(DEMO_RESET_ENV_VAR) or "").strip().lower() in ("1", "true", "yes", "on")


def data_dir_from_environment() -> Path:
    """The directory holding `control.db` and `tenants/`.

    MONETARY_DATA_DIR wins. Otherwise, when MONETARY_DB_PATH is set (the single-file setting of earlier
    releases) its folder is used, so old configurations keep working. Otherwise the default directory;
    in demo mode a separate `demo/` subdirectory, never the real one."""
    explicit = read_env(DATA_DIR_ENV_VAR)
    if explicit and explicit.strip():
        return Path(explicit.strip()).expanduser()
    legacy = read_env(DB_ENV_VAR)
    if legacy and legacy.strip():
        return Path(legacy.strip()).expanduser().parent
    return DEFAULT_DEMO_DATA_DIR if demo_mode_enabled() else DEFAULT_DATA_DIR


def legacy_db_path_from_environment() -> Path | None:
    """The single-owner ledger file of an earlier release, to be adopted on first start, or None.

    MONETARY_DB_PATH if set, else `monetary.db` inside the data directory. Never used in demo mode."""
    if demo_mode_enabled():
        return None
    explicit = read_env(DB_ENV_VAR)
    if explicit and explicit.strip():
        return Path(explicit.strip()).expanduser()
    return data_dir_from_environment() / "monetary.db"


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
