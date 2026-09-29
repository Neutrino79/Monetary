import pytest

from duevia import config


def test_defaults_are_safe(monkeypatch):
    for v in (config.ENV_ENV_VAR, config.DOCS_ENV_VAR, config.CORS_ENV_VAR, config.DB_ENV_VAR):
        monkeypatch.delenv(v, raising=False)
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
