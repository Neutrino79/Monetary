"""Accounts, approval and per-user ledgers through the HTTP API (docs/MULTI_TENANT.md)."""
from __future__ import annotations

import pytest

from monetary.application import identity_service, provisioning
from monetary.infrastructure import control_db, control_repository as crepo
from tests.support.sample_data import API, OWNER

NEWCOMER = {
    "name": "Ravi Kumar", "email": "ravi@example.com", "currency": "INR", "timezone": "Asia/Kolkata",
    "password": "ravi-password-1",  # pragma: allowlist secret
    "security_question_id": 2, "security_answer": "Pune",  # pragma: allowlist secret
}


def _login(client, email, password):
    return client.post(f"{API}/auth/login", data={"username": email, "password": password})


def _bearer(response):
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _approve(data_dir, email):
    """Stand-in for the admin approval flow (added with the admin API): activate and give a ledger."""
    control = control_db.connect_control(data_dir)
    try:
        user = crepo.get_user_by_email(control, email)
        crepo.update_user(control, user["id"], now="2026-01-01T00:00:00+00:00", status="active")
        provisioning.provision_ledger(control, data_dir, user["id"])
        control.commit()
    finally:
        control.close()


def test_setup_creates_a_superuser_with_a_ledger_and_closes(client):
    assert client.get(f"{API}/setup/status").json()["initialized"] is False
    r = client.post(f"{API}/setup/init", json=OWNER)
    assert r.status_code == 201
    headers = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    me = client.get(f"{API}/me", headers=headers).json()
    assert (me["role"], me["status"], me["hasLedger"], me["mustChangePassword"]) == ("superuser", "active", True, False)
    assert client.get(f"{API}/setup/status").json()["initialized"] is True
    assert client.post(f"{API}/setup/init", json={**OWNER, "email": "other@example.com"}).status_code == 409


def test_register_is_generic_and_does_not_reveal_existing_emails(client):
    client.post(f"{API}/setup/init", json=OWNER)
    first = client.post(f"{API}/auth/register", json=NEWCOMER)
    again = client.post(f"{API}/auth/register", json=NEWCOMER)
    taken = client.post(f"{API}/auth/register", json={**NEWCOMER, "email": OWNER["email"]})
    assert first.status_code == again.status_code == taken.status_code == 202
    assert first.json() == again.json() == taken.json()


def test_pending_account_is_told_only_after_the_right_password(client, api_data_dir):
    client.post(f"{API}/setup/init", json=OWNER)
    client.post(f"{API}/auth/register", json=NEWCOMER)
    wrong = _login(client, NEWCOMER["email"], "wrong-password-1")
    unknown = _login(client, "nobody@example.com", "wrong-password-1")
    assert wrong.status_code == unknown.status_code == 401 and wrong.json() == unknown.json()
    pending = _login(client, NEWCOMER["email"], NEWCOMER["password"])
    assert pending.status_code == 403 and pending.json()["error_type"] == "AccountPendingApproval"


def test_approved_user_gets_a_separate_private_ledger(client, api_data_dir):
    owner = {"Authorization": f"Bearer {client.post(f'{API}/setup/init', json=OWNER).json()['accessToken']}"}
    client.post(f"{API}/auth/register", json=NEWCOMER)
    _approve(api_data_dir, NEWCOMER["email"])
    ravi = _bearer(_login(client, NEWCOMER["email"], NEWCOMER["password"]))

    made = client.post(f"{API}/accounts", headers=ravi,
                       json={"name": "Ravi Bank", "type": "ASSET", "currency": "INR"})
    assert made.status_code == 201, made.text
    assert [a["name"] for a in client.get(f"{API}/accounts", headers=ravi).json()] == ["Ravi Bank"]
    assert client.get(f"{API}/accounts", headers=owner).json() == []  # the other ledger is untouched
    assert client.get(f"{API}/owner", headers=ravi).json()["email"] == NEWCOMER["email"]
    assert client.get(f"{API}/me", headers=ravi).json()["role"] == "user"
    assert len(list((api_data_dir / "tenants").glob("*.db"))) == 2


def test_suspended_account_loses_access_immediately(client, api_data_dir):
    client.post(f"{API}/setup/init", json=OWNER)
    client.post(f"{API}/auth/register", json=NEWCOMER)
    _approve(api_data_dir, NEWCOMER["email"])
    ravi = _bearer(_login(client, NEWCOMER["email"], NEWCOMER["password"]))
    assert client.get(f"{API}/owner", headers=ravi).status_code == 200
    control = control_db.connect_control(api_data_dir)
    user = crepo.get_user_by_email(control, NEWCOMER["email"])
    crepo.update_user(control, user["id"], now="2026-01-02T00:00:00+00:00", status="suspended")
    control.commit()
    control.close()
    assert client.get(f"{API}/owner", headers=ravi).status_code == 401


def test_temporary_password_must_be_replaced_first(client, api_data_dir):
    client.post(f"{API}/setup/init", json=OWNER)
    client.post(f"{API}/auth/register", json=NEWCOMER)
    _approve(api_data_dir, NEWCOMER["email"])
    control = control_db.connect_control(api_data_dir)
    user = crepo.get_user_by_email(control, NEWCOMER["email"])
    crepo.update_user(control, user["id"], now="2026-01-02T00:00:00+00:00", must_change_password=True)
    control.commit()
    control.close()

    ravi = _bearer(_login(client, NEWCOMER["email"], NEWCOMER["password"]))
    blocked = client.get(f"{API}/accounts", headers=ravi)
    assert blocked.status_code == 403 and blocked.json()["error_type"] == "PasswordChangeRequired"
    assert client.get(f"{API}/me", headers=ravi).json()["mustChangePassword"] is True
    changed = client.post(f"{API}/auth/change-password", headers=ravi, json={
        "current_password": NEWCOMER["password"], "new_password": "ravi-new-password-2"})  # pragma: allowlist secret
    assert changed.status_code == 200
    again = _bearer(_login(client, NEWCOMER["email"], "ravi-new-password-2"))  # pragma: allowlist secret
    assert client.get(f"{API}/accounts", headers=again).status_code == 200


def test_renaming_the_owner_updates_the_account(client, api_data_dir):
    headers = {"Authorization": f"Bearer {client.post(f'{API}/setup/init', json=OWNER).json()['accessToken']}"}
    assert client.patch(f"{API}/owner", headers=headers, json={"name": "Asha P", "timezone": "UTC"}).status_code == 200
    me = client.get(f"{API}/me", headers=headers).json()
    assert me["name"] == "Asha P"


def test_a_missing_ledger_is_reported_not_crashed(client, api_data_dir):
    client.post(f"{API}/setup/init", json=OWNER)
    control = control_db.connect_control(api_data_dir)
    now = "2026-01-01T00:00:00+00:00"
    crepo.create_user(
        control, email="ghost@example.com", name="Ghost", password_hash=identity_service.hash_password("ghost-password-1"),  # pragma: allowlist secret
        security_question_id=None, security_answer_hash=None, role="user", status="active",
        timezone="UTC", home_currency_code="INR", approved_at=now, now=now)
    control.commit()
    control.close()
    ghost = _bearer(_login(client, "ghost@example.com", "ghost-password-1"))  # pragma: allowlist secret
    assert client.get(f"{API}/me", headers=ghost).json()["hasLedger"] is False
    r = client.get(f"{API}/accounts", headers=ghost)
    assert r.status_code == 403 and r.json()["error_type"] == "NoLedgerError"


def test_an_earlier_single_owner_database_is_adopted_in_place(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from monetary.application import user_service
    from monetary.infrastructure import db
    from monetary.presentation.api import deps
    from monetary.presentation.api.app import app

    legacy = tmp_path / "monetary.db"
    ledger = db.connect(legacy)
    user_service.bootstrap_owner(
        ledger, name="Old Owner", email="old@example.com", timezone="UTC", home_currency_code="INR",
        password="old-password-123", security_question_id=1, security_answer="x")  # pragma: allowlist secret
    ledger.commit()
    ledger.close()

    monkeypatch.setenv("MONETARY_DB_PATH", str(legacy))
    deps._prepared_data_dirs.clear()
    client = TestClient(app)
    assert client.get(f"{API}/setup/status").json()["initialized"] is True  # no second first-run
    token = _login(client, "old@example.com", "old-password-123")  # pragma: allowlist secret
    assert token.status_code == 200
    me = client.get(f"{API}/me", headers=_bearer(token)).json()
    assert me["role"] == "superuser" and me["hasLedger"] is True
    assert client.get(f"{API}/owner", headers=_bearer(token)).json()["name"] == "Old Owner"


def test_register_requires_valid_input_and_is_rate_limited(client):
    client.post(f"{API}/setup/init", json=OWNER)
    # the rejected attempt counts towards the limit of 5 per hour, like any other
    assert client.post(f"{API}/auth/register", json={**NEWCOMER, "password": "short"}).status_code == 422  # pragma: allowlist secret
    codes = [client.post(f"{API}/auth/register", json={**NEWCOMER, "email": f"u{i}@example.com"}).status_code
             for i in range(6)]
    assert codes[:4] == [202] * 4 and codes[4:] == [429, 429]


@pytest.mark.parametrize("path", ["/me", "/owner", "/accounts"])
def test_endpoints_need_a_session(client, path):
    assert client.get(API + path).status_code == 401
