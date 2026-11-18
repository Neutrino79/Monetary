"""Demo mode: MONETARY_DEMO_MODE exposes a password-less session on a generated sample ledger."""
import pytest

from monetary.application import demo_service
from monetary.config import DEFAULT_DATA_DIR, DEFAULT_DEMO_DATA_DIR, data_dir_from_environment
from monetary.infrastructure import control_db
from monetary.application import provisioning
from tests.support.sample_data import API, OWNER


@pytest.fixture()
def demo(monkeypatch):
    monkeypatch.setenv("MONETARY_DEMO_MODE", "true")


def _enter(client):
    r = client.post(f"{API}/auth/demo")
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _ledger_scalar(data_dir, sql):
    control = control_db.connect_control(data_dir)
    uid = control.execute("SELECT id FROM user WHERE email = ?", (demo_service.DEMO_OWNER_EMAIL,)).fetchone()["id"]
    ledger = provisioning.open_ledger(control, data_dir, uid)
    control.close()
    try:
        return ledger.execute(sql).fetchone()[0]
    finally:
        ledger.close()


def test_demo_endpoint_does_not_exist_by_default(client):
    assert client.post(f"{API}/auth/demo").status_code == 404
    assert client.get(f"{API}/meta").json()["demo"] is False


def test_meta_reports_demo(client, demo):
    assert client.get(f"{API}/meta").json()["demo"] is True


def test_demo_session_opens_a_populated_ledger(client, demo):
    headers = _enter(client)
    owner = client.get(f"{API}/owner", headers=headers).json()
    assert owner["email"] == demo_service.DEMO_OWNER_EMAIL
    accounts = client.get(f"{API}/accounts", headers=headers).json()
    assert {"Everyday Bank", "Savings", "Cash", "Credit Card"} <= {a["name"] for a in accounts}
    assert len(client.get(f"{API}/friends", headers=headers).json()) == 2
    assert client.get(f"{API}/splits", headers=headers).json()
    assert client.get(f"{API}/transactions", headers=headers).status_code == 200


def test_demo_ledger_is_created_once(client, demo, api_data_dir):
    _enter(client)
    count = lambda: _ledger_scalar(api_data_dir, "SELECT COUNT(*) FROM journal_entry")  # noqa: E731
    first = count()
    _enter(client)
    assert count() == first > 20


def test_demo_dates_are_relative_to_today(client, demo, api_data_dir):
    from datetime import date
    _enter(client)
    newest = _ledger_scalar(api_data_dir, "SELECT MAX(entry_date) FROM journal_entry")
    assert (date.today() - date.fromisoformat(newest[:10])).days <= 3


def test_password_changes_are_blocked_in_demo(client, demo):
    headers = _enter(client)
    r = client.post(f"{API}/auth/change-password", headers=headers,
                    json={"current_password": "x" * 12, "new_password": "y" * 12})
    assert r.status_code == 403
    r = client.post(f"{API}/auth/reset-password", json={
        "email": demo_service.DEMO_OWNER_EMAIL, "security_answer": "a", "new_password": "y" * 12})
    assert r.status_code == 403


def test_demo_account_has_no_password_and_cannot_log_in(client, demo):
    _enter(client)
    r = client.post(f"{API}/auth/login", data={"username": demo_service.DEMO_OWNER_EMAIL, "password": "x" * 12})
    assert r.status_code == 401


def test_registration_is_disabled_in_demo(client, demo):
    r = client.post(f"{API}/auth/register", json={
        "name": "N", "email": "n@example.com", "currency": "USD", "password": "long-enough-1",  # pragma: allowlist secret
        "securityQuestionId": 1, "securityAnswer": "a"})
    assert r.status_code == 403


def test_demo_refuses_a_data_dir_with_real_accounts(client, api_data_dir):
    assert client.post(f"{API}/setup/init", json=OWNER).status_code == 201  # a real superuser exists
    monkeypatch_demo = pytest.MonkeyPatch()
    monkeypatch_demo.setenv("MONETARY_DEMO_MODE", "true")
    try:
        r = client.post(f"{API}/auth/demo")
    finally:
        monkeypatch_demo.undo()
    assert r.status_code == 409 and "real accounts" in r.json()["detail"]


def test_default_dirs_are_separate_in_demo_mode(monkeypatch):
    monkeypatch.delenv("MONETARY_DATA_DIR", raising=False)
    monkeypatch.delenv("MONETARY_DB_PATH", raising=False)
    assert data_dir_from_environment() == DEFAULT_DATA_DIR
    monkeypatch.setenv("MONETARY_DEMO_MODE", "1")
    assert data_dir_from_environment() == DEFAULT_DEMO_DATA_DIR
    monkeypatch.setenv("MONETARY_DATA_DIR", "/tmp/x")
    assert str(data_dir_from_environment()) == "/tmp/x"


def test_startup_builds_demo_and_fails_fast_on_real_accounts(client, demo, api_data_dir):
    import asyncio

    from monetary.presentation.api.app import app, lifespan

    async def run():
        async with lifespan(app):
            pass

    asyncio.run(run())
    assert _ledger_scalar(api_data_dir, "SELECT COUNT(*) FROM journal_entry") > 20
    asyncio.run(run())  # a second start is a no-op
    control = control_db.connect_control(api_data_dir)
    control.execute("UPDATE user SET email='real@example.com'")
    control.commit()
    control.close()
    with pytest.raises(Exception, match="real accounts"):
        asyncio.run(run())


def test_reset_rebuilds_the_demo_data(client, demo, api_data_dir):
    import os

    _enter(client)
    demo_service.reset_demo_data(api_data_dir)
    assert not os.path.exists(api_data_dir / control_db.CONTROL_DB_FILENAME)
    headers = _enter(client)  # rebuilt on demand
    assert client.get(f"{API}/owner", headers=headers).json()["name"] == demo_service.DEMO_OWNER_NAME


def test_reset_refuses_real_accounts(client, api_data_dir):
    import os

    assert client.post(f"{API}/setup/init", json=OWNER).status_code == 201
    with pytest.raises(Exception, match="real accounts"):
        demo_service.reset_demo_data(api_data_dir)
    assert os.path.exists(api_data_dir / control_db.CONTROL_DB_FILENAME)


def test_reset_on_start_flag(monkeypatch):
    from monetary.config import demo_reset_on_start
    assert demo_reset_on_start() is False
    monkeypatch.setenv("MONETARY_DEMO_RESET", "true")
    assert demo_reset_on_start() is True
