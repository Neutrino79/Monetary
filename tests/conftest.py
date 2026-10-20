"""Shared pytest fixtures. Every test gets its own temporary SQLite database."""
from __future__ import annotations

import os

# Fixed, known environment BEFORE the app is imported (docs/CORS are read at import).
for _key in [k for k in os.environ if k.startswith("MONETARY_")]:
    del os.environ[_key]
os.environ["MONETARY_ENV"] = "development"

import bcrypt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from monetary.infrastructure import db as db_module  # noqa: E402
from monetary.infrastructure.rate_limiter import (  # noqa: E402
    login_rate_limiter,
    password_reset_rate_limiter,
)
from tests import sample_data  # noqa: E402
from tests.helpers import Api, World, assert_ledger_invariants  # noqa: E402


def pytest_collection_modifyitems(items):
    """Auto-mark tests by directory so `pytest -m unit|service|api` works."""
    for item in items:
        for name in ("unit", "service", "api"):
            if f"/tests/{name}/" in str(item.fspath).replace("\\", "/"):
                item.add_marker(getattr(pytest.mark, name))


@pytest.fixture(autouse=True)
def _fast_bcrypt(monkeypatch):
    """bcrypt cost 4 instead of 12: same code paths, ~100x faster tests."""
    real = bcrypt.gensalt
    monkeypatch.setattr(bcrypt, "gensalt", lambda *a, **k: real(rounds=4))


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    for lim in (login_rate_limiter, password_reset_rate_limiter):
        lim._hits.clear()
    yield
    for lim in (login_rate_limiter, password_reset_rate_limiter):
        lim._hits.clear()


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("MONETARY_DB_PATH", str(path))
    return path


@pytest.fixture()
def conn(db_path):
    """A raw connection to a fresh DB, for service/repository-level tests."""
    c = db_module.connect(db_path)
    yield c
    c.close()


@pytest.fixture()
def client(db_path):
    from monetary.presentation.api.app import app
    yield TestClient(app)
    assert_ledger_invariants(db_path)  # every API test also validates the ledger


@pytest.fixture()
def anon(client) -> Api:
    """Unauthenticated API wrapper; no owner exists yet."""
    return Api(client)


@pytest.fixture()
def api(client) -> Api:
    """Authenticated API wrapper; owner exists but no accounts/categories."""
    r = client.post(sample_data.API + "/setup/init", json=sample_data.OWNER)
    assert r.status_code == 201, r.text
    return Api(client, r.json()["accessToken"])


@pytest.fixture()
def world(api) -> World:
    """The full sample world (see tests/sample_data.py), bank funded."""
    return World(api, sample_data.seed(api.client, {"Authorization": f"Bearer {api.token}"}))


@pytest.fixture()
def bare_world(api) -> World:
    """Sample accounts/categories/friends, but NO opening balance."""
    return World(api, sample_data.seed(api.client, {"Authorization": f"Bearer {api.token}"}, fund=False))
