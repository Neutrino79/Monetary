import os

import pytest

from monetary import config


@pytest.fixture(autouse=True)
def _no_ambient_config(monkeypatch):
    """Start every test from a clean slate: neither MONETARY_* nor legacy DUEVIA_* set."""
    for key in [k for k in os.environ if k.startswith(("MONETARY_", "DUEVIA_"))]:
        monkeypatch.delenv(key)


def test_defaults_are_safe(monkeypatch):
    assert config.environment_name() == "production"
    assert config.docs_enabled_from_environment() is False
    assert config.cors_origins_from_environment() == ""
    assert config.database_path_from_environment() is None


@pytest.mark.parametrize("env,override,expected", [
    ("development", None, True), ("production", None, False), ("Production ", None, False),
    ("production", "true", True), ("production", "1", True), ("production", "off", False),
    ("development", "false", False), ("development", "0", False),
])
def test_docs_toggle(monkeypatch, env, override, expected):
    monkeypatch.setenv(config.ENV_ENV_VAR, env)
    if override is None:
        monkeypatch.delenv(config.DOCS_ENV_VAR, raising=False)
    else:
        monkeypatch.setenv(config.DOCS_ENV_VAR, override)
    assert config.docs_enabled_from_environment() is expected


def test_api_prefix_matches_version():
    assert config.API_PREFIX == f"/api/{config.API_VERSION}"


# --- legacy DUEVIA_* names: still honoured so existing deployments keep working ---

ALL_VARS = [config.APP_NAME_ENV_VAR, config.APP_TAGLINE_ENV_VAR, config.SEED_DEFAULTS_ENV_VAR,
            config.DB_ENV_VAR, config.CORS_ENV_VAR, config.ENV_ENV_VAR, config.DOCS_ENV_VAR]


def test_every_variable_is_monetary_prefixed():
    assert all(v.startswith(config.ENV_PREFIX) for v in ALL_VARS)


@pytest.mark.parametrize("name", ALL_VARS)
def test_legacy_spelling_is_derived_from_the_new_name(name):
    assert config.legacy_env_var(name) == "DUEVIA_" + name.removeprefix("MONETARY_")


def test_legacy_variables_are_used_as_a_fallback(monkeypatch):
    monkeypatch.setenv("DUEVIA_ENV", "development")
    monkeypatch.setenv("DUEVIA_CORS_ORIGINS", "http://legacy.example")
    monkeypatch.setenv("DUEVIA_DB_PATH", "/tmp/legacy.db")
    monkeypatch.setenv("DUEVIA_APP_NAME", "Legacy Name")
    monkeypatch.setenv("DUEVIA_ENABLE_DOCS", "false")
    assert config.environment_name() == "development"
    assert config.cors_origins_from_environment() == "http://legacy.example"
    assert config.database_path_from_environment() == "/tmp/legacy.db"
    assert config.app_name() == "Legacy Name"
    assert config.docs_enabled_from_environment() is False


def test_monetary_variables_win_over_legacy_ones(monkeypatch):
    monkeypatch.setenv("DUEVIA_ENV", "development")
    monkeypatch.setenv("MONETARY_ENV", "production")
    monkeypatch.setenv("DUEVIA_APP_NAME", "Old")
    monkeypatch.setenv("MONETARY_APP_NAME", "New")
    assert config.environment_name() == "production"
    assert config.app_name() == "New"


def test_default_database_path_keeps_its_persisted_location():
    # Existing installs keep their data here; renaming it would orphan their database.
    assert config.DEFAULT_DB_PATH.parts[-2:] == (".duevia_0.5", "expense.db")
