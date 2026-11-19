"""Shared pytest fixtures. Every test gets its own temporary SQLite database."""
from __future__ import annotations

import os

# Fixed, known environment BEFORE the app is imported (docs/CORS are read at import).
for _key in [k for k in os.environ if k.startswith("MONETARY_")]:
    del os.environ[_key]
os.environ["MONETARY_ENV"] = "development"
os.environ["MONETARY_CAPTCHA_PROVIDER"] = "none"  # tests that exercise the captcha turn it on themselves

import bcrypt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from monetary.infrastructure import db as db_module  # noqa: E402
from monetary.infrastructure.rate_limiter import (  # noqa: E402
    captcha_rate_limiter,
    login_failure_counter,
    login_rate_limiter,
    password_reset_rate_limiter,
    register_rate_limiter,
)
from tests.support import sample_data  # noqa: E402
from tests.support.helpers import Api, World, assert_ledger_invariants  # noqa: E402
from tests.support.service_ctx import ctx  # noqa: E402,F401  (fixture shared by service/ and infrastructure/)


def pytest_collection_modifyitems(items):
    """Auto-mark tests by directory so `pytest -m unit|service|infrastructure|api|tooling` works."""
    for item in items:
        for name in ("unit", "service", "infrastructure", "api", "tooling"):
            if f"/tests/{name}/" in str(item.fspath).replace("\\", "/"):
                item.add_marker(getattr(pytest.mark, name))


@pytest.fixture(autouse=True)
def _fast_bcrypt(monkeypatch):
    """bcrypt cost 4 instead of 12: same code paths, ~100x faster tests."""
    real = bcrypt.gensalt
    monkeypatch.setattr(bcrypt, "gensalt", lambda *a, **k: real(rounds=4))


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    limiters = (login_rate_limiter, password_reset_rate_limiter, register_rate_limiter, captcha_rate_limiter,
                login_failure_counter)
    for lim in limiters:
        lim._hits.clear()
    yield
    for lim in limiters:
        lim._hits.clear()


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("MONETARY_DB_PATH", str(path))
    return path


@pytest.fixture()
def data_dir(tmp_path):
    """A fresh data directory (control database + tenant ledgers) for multi-tenant tests."""
    path = tmp_path / "data"
    path.mkdir()
    return path


@pytest.fixture()
def control(data_dir):
    """A connection to a fresh control database."""
    from monetary.infrastructure import control_db
    c = control_db.connect_control(data_dir)
    yield c
    c.close()


@pytest.fixture()
def conn(db_path):
    """A raw connection to a fresh DB, for service/repository-level tests."""
    c = db_module.connect(db_path)
    yield c
    c.close()


@pytest.fixture()
def api_data_dir(data_dir, monkeypatch):
    """The data directory the API under test reads (MONETARY_DATA_DIR), fresh for every test."""
    from monetary.presentation.api import deps
    monkeypatch.setenv("MONETARY_DATA_DIR", str(data_dir))
    deps._prepared_data_dirs.discard(str(data_dir))
    return data_dir


@pytest.fixture()
def client(api_data_dir):
    from monetary.presentation.api.app import app
    yield TestClient(app)
    assert_ledger_invariants(api_data_dir)  # every API test also validates every ledger


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
    """The full sample world (see tests/support/sample_data.py), bank funded."""
    return World(api, sample_data.seed(api.client, {"Authorization": f"Bearer {api.token}"}))


@pytest.fixture()
def bare_world(api) -> World:
    """Sample accounts/categories/friends, but NO opening balance."""
    return World(api, sample_data.seed(api.client, {"Authorization": f"Bearer {api.token}"}, fund=False))
