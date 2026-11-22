"""Signed-in devices, security question, self-service deletion and purging chosen accounts."""
from __future__ import annotations

from tests.api import test_roles
from tests.api.test_roles import ADMIN, NEW_PASSWORD, _bearer, _login
from tests.support.sample_data import API

boss = test_roles.boss
team = test_roles.team


def _second_device(client, email="sam@example.com"):
    return _bearer(_login(client, email, NEW_PASSWORD).json()["access_token"])


def test_devices_list_marks_the_current_session(client, boss, team):
    other = _second_device(client)
    mine = client.get(f"{API}/me/sessions", headers=team["sam"]).json()
    assert len(mine) == 2 and [s["current"] for s in mine].count(True) == 1
    seen_from_other = client.get(f"{API}/me/sessions", headers=other).json()
    current_here = next(s for s in mine if s["current"])["id"]
    current_there = next(s for s in seen_from_other if s["current"])["id"]
    assert current_here != current_there
    assert client.get(f"{API}/me/sessions").status_code == 401


def test_sign_out_one_device_and_all_the_others(client, boss, team):
    second, third = _second_device(client), _second_device(client)
    sessions = client.get(f"{API}/me/sessions", headers=team["sam"]).json()
    victim = next(s for s in sessions if s["id"] == next(
        x["id"] for x in client.get(f"{API}/me/sessions", headers=second).json() if x["current"]))
    assert client.delete(f"{API}/me/sessions/{victim['id']}", headers=team["sam"]).status_code == 200
    assert client.get(f"{API}/me", headers=second).status_code == 401
    assert client.delete(f"{API}/me/sessions/{victim['id']}", headers=team["sam"]).status_code == 404
    ended = client.post(f"{API}/me/sessions/revoke-others", headers=team["sam"]).json()
    assert ended == {"ended": 1}
    assert client.get(f"{API}/me", headers=third).status_code == 401
    assert client.get(f"{API}/me", headers=team["sam"]).status_code == 200


def test_nobody_can_end_someone_elses_session(client, boss, team):
    theirs = next(s for s in client.get(f"{API}/me/sessions", headers=team["sam"]).json())["id"]
    assert client.delete(f"{API}/me/sessions/{theirs}", headers=team["admin1"]).status_code == 404
    assert client.get(f"{API}/me", headers=team["sam"]).status_code == 200


def test_account_card_facts(client, boss, team):
    body = client.get(f"{API}/me/account", headers=team["sam"]).json()
    assert body["memberSince"] and body["ledgerBytes"] > 0 and body["deleteGraceDays"] == 30


def test_change_security_question_needs_the_password(client, boss, team):
    bad = client.put(f"{API}/me/security-question", headers=team["sam"], json={
        "current_password": "nope-nope-nope", "security_question_id": 1, "security_answer": "blue"})
    assert bad.status_code == 422 or bad.status_code == 400
    ok = client.put(f"{API}/me/security-question", headers=team["sam"], json={
        "current_password": NEW_PASSWORD, "security_question_id": 1, "security_answer": "blue"})
    assert ok.status_code == 200
    assert client.get(f"{API}/me/account", headers=team["sam"]).json()["securityQuestionId"] == 1
    invalid = client.put(f"{API}/me/security-question", headers=team["sam"], json={
        "current_password": NEW_PASSWORD, "security_question_id": 999, "security_answer": "blue"})
    assert invalid.status_code in (400, 422)


def test_deleting_my_account_locks_it_and_the_superuser_can_restore_it(client, boss, team):
    ids = team["ids"]
    wrong = client.post(f"{API}/me/delete", headers=team["sam"], json={"password": "wrong-password-1"})
    assert wrong.status_code in (400, 422)
    assert client.post(f"{API}/me/delete", headers=team["sam"], json={"password": NEW_PASSWORD}).status_code == 200
    assert client.get(f"{API}/me", headers=team["sam"]).status_code == 401
    assert _login(client, "sam@example.com", NEW_PASSWORD).status_code != 200
    shown = client.get(f"{ADMIN}/users/{ids['sam']}", headers=boss).json()
    assert shown["status"] == "pending_delete" and shown["deleteAfter"]
    assert client.post(f"{ADMIN}/users/{ids['sam']}/restore", headers=boss).json()["status"] == "active"


def test_the_superuser_cannot_delete_their_own_account(client, boss):
    from tests.support.sample_data import OWNER
    r = client.post(f"{API}/me/delete", headers=boss, json={"password": OWNER["password"]})
    assert r.status_code == 409


def test_purge_selected_removes_only_pending_deletion_accounts(client, boss, team):
    ids = team["ids"]
    client.post(f"{ADMIN}/users/{ids['ravi']}/delete", headers=boss)
    refused = client.post(f"{ADMIN}/purge-selected", headers=team["admin1"], json={"user_ids": [ids["ravi"]]})
    assert refused.status_code == 403
    out = client.post(f"{ADMIN}/purge-selected", headers=boss, json={"user_ids": [ids["ravi"], ids["sam"]]})
    assert out.json() == {"purged": 1}  # sam is active, so untouched
    assert client.get(f"{ADMIN}/users/{ids['ravi']}", headers=boss).status_code == 404
    assert client.get(f"{ADMIN}/users/{ids['sam']}", headers=boss).status_code == 200
    log = client.get(f"{ADMIN}/audit-log", headers=boss).json()["items"]
    purge = next(e for e in log if e["action"] == "user.purge")
    assert "forced" in str(purge) and "ravi@example.com" in str(purge)
    assert client.post(f"{ADMIN}/purge-selected", headers=boss, json={"user_ids": []}).status_code == 422


def test_purge_selected_respects_the_bulk_limit(client, boss, monkeypatch):
    monkeypatch.setenv("MONETARY_ADMIN_BULK_LIMIT", "1")
    r = client.post(f"{ADMIN}/purge-selected", headers=boss, json={"user_ids": [5, 6]})
    assert r.status_code == 422
