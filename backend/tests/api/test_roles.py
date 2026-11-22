"""The three roles over HTTP: the single superuser, admins with limited powers, and ordinary users."""
from __future__ import annotations

import json

import pytest

from tests.support.sample_data import API, OWNER

ADMIN = f"{API}/admin"
NEW_PASSWORD = "admin-new-password-1"  # pragma: allowlist secret


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, email, password):
    return client.post(f"{API}/auth/login", data={"username": email, "password": password})


def _create(client, headers, email, role="user"):
    r = client.post(f"{ADMIN}/users", headers=headers, json={"name": email.split("@")[0].title(), "email": email,
                                                              "currency": "INR", "role": role})
    assert r.status_code == 201, r.text
    return r.json()


def _sign_in(client, created, email):
    """Sign in with the temporary password and replace it, as a new account must."""
    temp = created["temporaryPassword"]
    first = _bearer(_login(client, email, temp).json()["access_token"])
    client.post(f"{API}/auth/change-password", headers=first,
                json={"current_password": temp, "new_password": NEW_PASSWORD})
    return _bearer(_login(client, email, NEW_PASSWORD).json()["access_token"])


@pytest.fixture()
def boss(client):
    return _bearer(client.post(f"{API}/setup/init", json=OWNER).json()["accessToken"])


@pytest.fixture()
def team(client, boss):
    """The superuser's headers plus an admin, a second admin and two ordinary users."""
    made = {name: _create(client, boss, f"{name}@example.com", role="admin" if name.startswith("admin") else "user")
            for name in ("admin1", "admin2", "sam", "ravi")}
    return {
        "boss": boss, "ids": {n: m["user"]["id"] for n, m in made.items()},
        "admin1": _sign_in(client, made["admin1"], "admin1@example.com"),
        "sam": _sign_in(client, made["sam"], "sam@example.com"),
    }


def test_only_the_superuser_can_make_admins(client, boss, team):
    ids = team["ids"]
    assert client.get(f"{API}/me", headers=team["admin1"]).json()["role"] == "admin"
    refused = client.post(f"{ADMIN}/users", headers=team["admin1"], json={
        "name": "Eve", "email": "eve@example.com", "currency": "INR", "role": "admin"})
    assert refused.status_code == 403
    assert client.put(f"{ADMIN}/users/{ids['sam']}/role", headers=team["admin1"], json={"role": "admin"}).status_code == 403
    assert client.put(f"{ADMIN}/users/{ids['sam']}/role", headers=boss, json={"role": "admin"}).json()["role"] == "admin"


def test_nobody_can_become_or_create_a_second_superuser(client, boss, team):
    ids = team["ids"]
    assert client.put(f"{ADMIN}/users/{ids['sam']}/role", headers=boss, json={"role": "superuser"}).status_code == 409
    made = client.post(f"{ADMIN}/users", headers=boss, json={
        "name": "Boss 2", "email": "boss2@example.com", "currency": "INR", "role": "superuser"})
    assert made.status_code == 409
    me = client.get(f"{API}/me", headers=boss).json()["id"]
    assert client.put(f"{ADMIN}/users/{me}/role", headers=boss, json={"role": "admin"}).status_code == 409
    listing = client.get(f"{ADMIN}/users", headers=boss, params={"limit": 200}).json()["items"]
    assert [u["role"] for u in listing].count("superuser") == 1


def test_an_admin_manages_ordinary_users(client, boss, team):
    ids, headers = team["ids"], team["admin1"]
    assert client.get(f"{ADMIN}/stats", headers=headers).json()["activeAdmins"] == 2
    assert client.get(f"{ADMIN}/users", headers=headers).status_code == 200
    assert client.get(f"{ADMIN}/audit-log", headers=headers).status_code == 200
    created = client.post(f"{ADMIN}/users", headers=headers, json={"name": "New", "email": "new@example.com", "currency": "INR"})
    assert created.status_code == 201
    assert client.post(f"{ADMIN}/users/{ids['ravi']}/suspend", headers=headers).json()["status"] == "suspended"
    assert client.post(f"{ADMIN}/users/{ids['ravi']}/reactivate", headers=headers).json()["status"] == "active"
    assert "temporaryPassword" in client.post(f"{ADMIN}/users/{ids['ravi']}/reset-password", headers=headers).json()
    assert client.post(f"{ADMIN}/users/{ids['ravi']}/unlock", headers=headers).status_code == 200
    assert client.post(f"{ADMIN}/users/{ids['ravi']}/revoke-sessions", headers=headers).status_code == 200


def test_an_admin_can_approve_and_reject_requests(client, boss, team):
    for who in ("a", "b"):
        client.post(f"{API}/auth/register", json={
            "name": who, "email": f"{who}@example.com", "currency": "INR", "timezone": "UTC",
            "password": "applicant-password-1", "security_question_id": 1, "security_answer": "x"})  # pragma: allowlist secret
    pending = client.get(f"{ADMIN}/users", headers=team["admin1"], params={"status": "pending_approval"}).json()["items"]
    a, b = (u["id"] for u in sorted(pending, key=lambda u: u["email"]))
    assert client.post(f"{ADMIN}/users/{a}/approve", headers=team["admin1"]).json()["status"] == "active"
    assert client.post(f"{ADMIN}/users/{b}/reject", headers=team["admin1"], json={"reason": "no"}).json()["status"] == "rejected"
    assert client.post(f"{ADMIN}/users/{b}/reopen", headers=team["admin1"]).json()["status"] == "pending_approval"


def test_an_admin_cannot_delete_restore_or_touch_equals_and_superiors(client, boss, team):
    ids, headers = team["ids"], team["admin1"]
    me = client.get(f"{API}/me", headers=boss).json()["id"]
    assert client.post(f"{ADMIN}/users/{ids['sam']}/delete", headers=headers).status_code == 403
    assert client.post(f"{ADMIN}/users/{ids['sam']}/restore", headers=headers).status_code == 403
    for target in (ids["admin2"], me):  # another admin, and the superuser
        for action in ("suspend", "reactivate", "reset-password", "unlock", "revoke-sessions"):
            r = client.post(f"{ADMIN}/users/{target}/{action}", headers=headers)
            assert r.status_code == 403, (target, action, r.text)
    own = client.get(f"{API}/me", headers=headers).json()["id"]
    assert client.post(f"{ADMIN}/users/{own}/suspend", headers=headers).status_code == 409
    assert client.post(f"{ADMIN}/users/{own}/reset-password", headers=headers).status_code == 409
    assert client.post(f"{ADMIN}/users/{own}/revoke-sessions", headers=headers).status_code == 200  # signing yourself out is fine


def test_the_superuser_can_manage_admins_and_delete(client, boss, team):
    ids = team["ids"]
    assert client.post(f"{ADMIN}/users/{ids['admin2']}/suspend", headers=boss).json()["status"] == "suspended"
    assert client.post(f"{ADMIN}/users/{ids['admin2']}/delete", headers=boss).json()["status"] == "pending_delete"
    assert client.post(f"{ADMIN}/users/{ids['admin2']}/restore", headers=boss).status_code == 200


def test_ordinary_users_have_no_admin_access(client, boss, team):
    for method, path in (("get", "/stats"), ("get", "/users"), ("get", "/audit-log"), ("post", f"/users/{team['ids']['ravi']}/unlock")):
        assert getattr(client, method)(f"{ADMIN}{path}", headers=team["sam"]).status_code == 403


def test_a_demoted_admin_loses_access_at_once(client, boss, team):
    admin_id = team["ids"]["admin1"]
    assert client.put(f"{ADMIN}/users/{admin_id}/role", headers=boss, json={"role": "user"}).json()["role"] == "user"
    assert client.get(f"{ADMIN}/stats", headers=team["admin1"]).status_code == 401  # signed out by the role change
    again = _bearer(_login(client, "admin1@example.com", NEW_PASSWORD).json()["access_token"])
    assert client.get(f"{ADMIN}/stats", headers=again).status_code == 403


def test_the_audit_log_records_the_role_of_whoever_acted(client, boss, team):
    client.post(f"{ADMIN}/users/{team['ids']['ravi']}/suspend", headers=team["admin1"])
    entry = next(e for e in client.get(f"{ADMIN}/audit-log", headers=boss).json()["items"] if e["action"] == "user.suspend")
    assert json.loads(entry["detail"])["actor_role"] == "admin"
