"""The superuser Admin API: approvals, temporary passwords, suspension, deletion and the audit trail."""
from __future__ import annotations

import pytest

from tests.support.sample_data import API, OWNER

ADMIN = f"{API}/admin"
RAVI = {
    "name": "Ravi Kumar", "email": "ravi@example.com", "currency": "INR", "timezone": "Asia/Kolkata",
    "password": "ravi-password-1",  # pragma: allowlist secret
    "security_question_id": 2, "security_answer": "Pune",  # pragma: allowlist secret
}


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, email, password):
    return client.post(f"{API}/auth/login", data={"username": email, "password": password})


@pytest.fixture()
def admin(client):
    return _bearer(client.post(f"{API}/setup/init", json=OWNER).json()["accessToken"])


def _create(client, admin, email="sam@example.com", **extra):
    r = client.post(f"{ADMIN}/users", headers=admin,
                    json={"name": "Sam", "email": email, "currency": "INR", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _pending(client, admin):
    client.post(f"{API}/auth/register", json=RAVI)
    users = client.get(f"{ADMIN}/users", headers=admin, params={"status": "pending_approval"}).json()
    assert users["total"] == 1
    return users["items"][0]["id"]


def _actions(client, admin):
    return [e["action"] for e in client.get(f"{ADMIN}/audit-log", headers=admin).json()["items"]]


def test_admin_endpoints_need_a_superuser(client, admin):
    created = _create(client, admin)
    sam = _login(client, "sam@example.com", created["temporaryPassword"])
    assert client.get(f"{ADMIN}/stats").status_code == 401
    assert client.get(f"{ADMIN}/stats", headers=_bearer(sam.json()["access_token"])).status_code == 403
    assert client.get(f"{ADMIN}/stats", headers=admin).status_code == 200


def test_created_user_gets_a_one_time_password_and_must_change_it(client, admin):
    created = _create(client, admin)
    temp = created["temporaryPassword"]
    assert created["user"]["mustChangePassword"] is True and created["user"]["status"] == "active"
    assert "passwordHash" not in created["user"]
    token = _login(client, "sam@example.com", temp).json()["access_token"]
    assert client.get(f"{API}/accounts", headers=_bearer(token)).status_code == 403  # change first
    ok = client.post(f"{API}/auth/change-password", headers=_bearer(token),
                     json={"current_password": temp, "new_password": "sam-new-password-1"})  # pragma: allowlist secret
    assert ok.status_code == 200
    fresh = _login(client, "sam@example.com", "sam-new-password-1").json()["access_token"]  # pragma: allowlist secret
    assert client.get(f"{API}/accounts", headers=_bearer(fresh)).status_code == 200
    # the temporary password is never stored in the audit trail
    assert temp not in str(client.get(f"{ADMIN}/audit-log", headers=admin).json())


def test_create_rejects_duplicates_and_bad_input(client, admin):
    _create(client, admin)
    dup = client.post(f"{ADMIN}/users", headers=admin, json={"name": "S", "email": "SAM@example.com", "currency": "INR"})
    assert dup.status_code == 409
    bad_role = client.post(f"{ADMIN}/users", headers=admin,
                           json={"name": "S", "email": "x@example.com", "currency": "INR", "role": "root"})
    assert bad_role.status_code == 422


def test_approve_then_user_can_sign_in_with_their_own_password(client, admin):
    uid = _pending(client, admin)
    assert client.get(f"{ADMIN}/stats", headers=admin).json()["pendingApproval"] == 1
    r = client.post(f"{ADMIN}/users/{uid}/approve", headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "active"
    assert _login(client, RAVI["email"], RAVI["password"]).status_code == 200
    assert client.post(f"{ADMIN}/users/{uid}/approve", headers=admin).status_code == 409  # only once


def test_reject_records_the_reason_and_blocks_login(client, admin):
    uid = _pending(client, admin)
    r = client.post(f"{ADMIN}/users/{uid}/reject", headers=admin, json={"reason": "Unknown applicant"})
    assert r.json()["status"] == "rejected" and r.json()["statusReason"] == "Unknown applicant"
    login = _login(client, RAVI["email"], RAVI["password"])
    assert login.status_code == 403 and login.json()["error_type"] == "AccountRejected"
    assert client.post(f"{ADMIN}/users/{uid}/reject", headers=admin).status_code == 409


def test_suspend_signs_the_user_out_and_reactivate_restores_access(client, admin):
    created = _create(client, admin)
    uid = created["user"]["id"]
    token = _login(client, "sam@example.com", created["temporaryPassword"]).json()["access_token"]
    assert client.post(f"{ADMIN}/users/{uid}/suspend", headers=admin, json={"reason": "abuse"}).status_code == 200
    assert client.get(f"{API}/me", headers=_bearer(token)).status_code == 401
    assert _login(client, "sam@example.com", created["temporaryPassword"]).json()["error_type"] == "AccountSuspended"
    assert client.post(f"{ADMIN}/users/{uid}/reactivate", headers=admin).json()["status"] == "active"
    assert _login(client, "sam@example.com", created["temporaryPassword"]).status_code == 200


def test_reset_password_issues_a_new_temporary_password(client, admin):
    created = _create(client, admin)
    uid = created["user"]["id"]
    old = created["temporaryPassword"]
    token = _login(client, "sam@example.com", old).json()["access_token"]
    new = client.post(f"{ADMIN}/users/{uid}/reset-password", headers=admin).json()["temporaryPassword"]
    assert new != old
    assert client.get(f"{API}/me", headers=_bearer(token)).status_code == 401
    assert _login(client, "sam@example.com", old).status_code == 401
    assert _login(client, "sam@example.com", new).status_code == 200


def test_revoke_sessions(client, admin):
    created = _create(client, admin)
    token = _login(client, "sam@example.com", created["temporaryPassword"]).json()["access_token"]
    assert client.post(f"{ADMIN}/users/{created['user']['id']}/revoke-sessions", headers=admin).status_code == 200
    assert client.get(f"{API}/me", headers=_bearer(token)).status_code == 401


def test_delete_and_restore_within_the_grace_period(client, admin):
    created = _create(client, admin)
    uid = created["user"]["id"]
    deleted = client.post(f"{ADMIN}/users/{uid}/delete", headers=admin).json()
    assert deleted["status"] == "pending_delete" and deleted["deleteAfter"]
    assert _login(client, "sam@example.com", created["temporaryPassword"]).json()["error_type"] == "AccountPendingDelete"
    assert client.post(f"{ADMIN}/users/{uid}/restore", headers=admin).json()["status"] == "active"
    assert client.post(f"{ADMIN}/users/{uid}/restore", headers=admin).status_code == 409


def test_restoring_an_account_that_never_had_a_ledger_returns_it_to_the_queue(client, admin):
    uid = _pending(client, admin)
    client.post(f"{ADMIN}/users/{uid}/delete", headers=admin)
    assert client.post(f"{ADMIN}/users/{uid}/restore", headers=admin).json()["status"] == "pending_approval"


def test_nobody_can_suspend_or_delete_themselves_or_the_last_superuser(client, admin):
    me = client.get(f"{API}/me", headers=admin).json()["id"]
    assert client.post(f"{ADMIN}/users/{me}/suspend", headers=admin).status_code == 409
    assert client.post(f"{ADMIN}/users/{me}/delete", headers=admin).status_code == 409
    assert client.put(f"{ADMIN}/users/{me}/role", headers=admin, json={"role": "user"}).status_code == 409


def test_roles_can_be_changed_and_a_second_superuser_may_demote_the_first(client, admin):
    second = _create(client, admin, email="boss@example.com", role="superuser")
    first = client.get(f"{API}/me", headers=admin).json()["id"]
    boss = _bearer(_login(client, "boss@example.com", second["temporaryPassword"]).json()["access_token"])
    client.post(f"{API}/auth/change-password", headers=boss, json={
        "current_password": second["temporaryPassword"], "new_password": "boss-new-password-1"})  # pragma: allowlist secret
    boss = _bearer(_login(client, "boss@example.com", "boss-new-password-1").json()["access_token"])  # pragma: allowlist secret
    assert client.put(f"{ADMIN}/users/{first}/role", headers=boss, json={"role": "user"}).json()["role"] == "user"
    # the demoted admin loses admin rights immediately, even with the same token
    assert client.get(f"{ADMIN}/stats", headers=admin).status_code == 401  # role change signed them out
    # and now `boss` is the last superuser
    me = client.get(f"{API}/me", headers=boss).json()["id"]
    assert client.put(f"{ADMIN}/users/{me}/role", headers=boss, json={"role": "user"}).status_code == 409
    assert client.put(f"{ADMIN}/users/{first}/role", headers=boss, json={"role": "nope"}).status_code == 422


def test_unknown_user_and_filters(client, admin):
    assert client.get(f"{ADMIN}/users/999", headers=admin).status_code == 404
    assert client.get(f"{ADMIN}/users", headers=admin, params={"status": "bogus"}).status_code == 422
    _create(client, admin)
    found = client.get(f"{ADMIN}/users", headers=admin, params={"q": "sam"}).json()
    assert found["total"] == 1 and found["items"][0]["email"] == "sam@example.com"
    assert client.get(f"{ADMIN}/users/{found['items'][0]['id']}", headers=admin).status_code == 200


def test_every_action_is_audited_newest_first(client, admin):
    created = _create(client, admin)
    uid = created["user"]["id"]
    client.post(f"{ADMIN}/users/{uid}/suspend", headers=admin)
    client.post(f"{ADMIN}/users/{uid}/reactivate", headers=admin)
    actions = _actions(client, admin)
    assert actions[:3] == ["user.reactivate", "user.suspend", "user.create"]
    per_user = client.get(f"{ADMIN}/audit-log", headers=admin, params={"user_id": uid}).json()
    assert per_user["total"] == 3
    stats = client.get(f"{ADMIN}/stats", headers=admin).json()
    assert stats["totalUsers"] == 2 and stats["activeSuperusers"] == 1 and stats["byStatus"]["active"] == 2


def test_admin_is_disabled_in_demo_mode(client, monkeypatch):
    token = client.post(f"{API}/setup/init", json=OWNER).json()["accessToken"]
    monkeypatch.setenv("MONETARY_DEMO_MODE", "true")
    assert client.get(f"{ADMIN}/stats", headers=_bearer(token)).status_code == 403
