"""Health, security headers, the auth-coverage guard, and error-contract tests."""
import pytest
from fastapi.testclient import TestClient

from monetary.presentation.api.app import app
from tests.support.sample_data import API

PUBLIC = {
    ("POST", f"{API}/setup/init"), ("POST", f"{API}/auth/login"),
    ("GET", f"{API}/auth/security-questions"), ("GET", f"{API}/auth/captcha"), ("GET", f"{API}/auth/security-question"),
    ("POST", f"{API}/auth/reset-password"), ("GET", "/health"), ("GET", "/"),
    ("GET", f"{API}/meta"), ("GET", f"{API}/setup/status"),
    ("POST", f"{API}/auth/register"),  # public sign-up request
    ("POST", f"{API}/auth/demo"),  # 404 unless MONETARY_DEMO_MODE is on
}


def all_operations():
    ops = []
    for path, item in app.openapi()["paths"].items():
        for method in item:
            if method.upper() in {"GET", "POST", "PATCH", "PUT", "DELETE"}:
                ops.append((method.upper(), path))
    return ops


def test_health_reports_db_ok(anon):
    r = anon.client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "database": "ok"}


def test_root_lists_service_info(anon):
    body = anon.client.get("/").json()
    assert body["api_base"] == API and body["health"] == "/health"


def test_security_headers_on_every_response(anon):
    r = anon.client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert "strict-transport-security" not in r.headers      # development


def test_hsts_in_production(anon, monkeypatch):
    monkeypatch.setenv("MONETARY_ENV", "production")
    assert "max-age" in anon.client.get("/health").headers["strict-transport-security"]


@pytest.mark.parametrize("method,path", [op for op in all_operations() if op not in PUBLIC])
def test_every_non_public_endpoint_requires_auth(anon, method, path):
    """Guard: a new endpoint added without auth fails this test."""
    import re
    url = re.sub(r"\{[^}]+\}", "1", path)
    r = anon.client.request(method, url, json={} if method in {"POST", "PATCH", "PUT"} else None)
    assert r.status_code == 401, f"{method} {path} -> {r.status_code} (expected 401)"
    assert r.headers["www-authenticate"] == "Bearer"


def test_openapi_is_nonempty_and_public_set_is_accurate():
    ops = set(all_operations())
    assert PUBLIC <= ops, f"PUBLIC lists endpoints that don't exist: {PUBLIC - ops}"
    assert len(ops) > 40


def test_unhandled_errors_return_generic_500_without_leaking(api, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("secret internal detail /etc/hidden")
    monkeypatch.setattr("monetary.application.account_service.list_accounts", boom)
    c = TestClient(app, raise_server_exceptions=False)
    r = c.get(API + "/accounts", headers={"Authorization": f"Bearer {api.token}"})
    assert r.status_code == 500
    assert r.json() == {"detail": "Internal server error.", "error_type": "InternalError"}
    assert "secret" not in r.text


def test_integrity_errors_map_to_409(api, monkeypatch):
    import sqlite3

    def boom(*a, **k):
        raise sqlite3.IntegrityError("FOREIGN KEY constraint failed")
    monkeypatch.setattr("monetary.application.account_service.list_accounts", boom)
    c = TestClient(app, raise_server_exceptions=False)
    r = c.get(API + "/accounts", headers={"Authorization": f"Bearer {api.token}"})
    assert r.status_code == 409 and r.json()["error_type"] == "ConflictError"
    assert "FOREIGN" not in r.text


def test_error_contract_shape(world):
    r = world.api.post("/transactions/expense", json=world.expense_payload(amount="1.234"))
    assert r.status_code == 422 and set(r.json()) == {"detail", "error_type"} and r.json()["error_type"] == "MoneyError"
    r = world.api.get("/transactions/99999")
    assert r.status_code == 404 and r.json()["error_type"] == "NotFoundError"
    e = world.expense(amount="10.00")
    r = world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "99999"})
    assert r.status_code == 409 and r.json()["error_type"] == "ConflictError"


@pytest.mark.parametrize("path", [
    "/accounts/99999999999999999999/balance",
    "/transactions?offset=1" + "0" * 30,
    "/transactions?accountId=99999999999999999999",
])
def test_out_of_range_numbers_are_422_not_500(api, path):
    r = api.get(path)
    assert r.status_code == 422, r.text


def test_db_dependency_commits_before_the_response_is_sent():
    """Regression: with FastAPI's default 'request' scope the commit ran *after* the response had
    been sent, so a client's immediate next request could read stale data (only visible against a
    real server, never through the in-process TestClient). The dependency must be function-scoped
    wherever FastAPI supports saying so."""
    import inspect

    from fastapi import Depends

    from monetary.presentation.api.deps import DB

    if "scope" in inspect.signature(Depends).parameters:
        assert DB.scope == "function"
