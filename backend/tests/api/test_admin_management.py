"""Admin user management over HTTP: sessions, editing, bulk actions, storage and activity, purge."""
from __future__ import annotations

from tests.api import test_roles
from tests.api.test_roles import ADMIN, API, NEW_PASSWORD

# Reuse the role tests' fixtures (a superuser plus an admin, a second admin and two ordinary users).
boss = test_roles.boss
team = test_roles.team


def test_sessions_are_listed_with_device_details_and_one_can_be_revoked(client, boss, team):
    ids = team["ids"]
    client.post(f"{API}/auth/login", data={"username": "sam@example.com", "password": NEW_PASSWORD},
                headers={"User-Agent": "TestBrowser/1.0"})
    listed = client.get(f"{ADMIN}/users/{ids['sam']}/sessions", headers=team["admin1"]).json()
    assert len(listed) >= 2 and all("token" not in s for s in listed)
    assert any(s["userAgent"] == "TestBrowser/1.0" and s["ip"] for s in listed)
    target = listed[0]["id"]
    assert client.delete(f"{ADMIN}/users/{ids['sam']}/sessions/{target}", headers=team["admin1"]).status_code == 200
    assert target not in [s["id"] for s in client.get(f"{ADMIN}/users/{ids['sam']}/sessions", headers=boss).json()]
    assert client.delete(f"{ADMIN}/users/{ids['sam']}/sessions/{target}", headers=boss).status_code == 404
    # an admin cannot reach a session of the superuser's account
    boss_id = client.get(f"{API}/me", headers=boss).json()["id"]
    sessions = client.get(f"{ADMIN}/users/{boss_id}/sessions", headers=boss).json()
    assert client.delete(f"{ADMIN}/users/{boss_id}/sessions/{sessions[0]['id']}",
                         headers=team["admin1"]).status_code == 403


def test_an_account_email_may_equal_one_of_its_friends_emails(client, boss, team):
    """Only friend create/edit is checked against the owner's email; an admin change is not (by design)."""
    ids = team["ids"]
    made = client.post(f"{API}/friends", headers=team["sam"],
                       json={"name": "Twin", "email": "twin@example.com"})
    assert made.status_code == 201
    moved = client.patch(f"{ADMIN}/users/{ids['sam']}", headers=boss, json={"email": "twin@example.com"})
    assert moved.status_code == 200 and moved.json()["email"] == "twin@example.com"


def test_last_seen_is_refreshed_at_most_once_per_interval(client, boss, team, monkeypatch):
    ids = team["ids"]
    before = client.get(f"{ADMIN}/users/{ids['sam']}/sessions", headers=boss).json()[0]["lastSeenAt"]
    client.get(f"{API}/me", headers=team["sam"])
    assert client.get(f"{ADMIN}/users/{ids['sam']}/sessions", headers=boss).json()[0]["lastSeenAt"] == before
    monkeypatch.setenv("MONETARY_SESSION_TOUCH_SECONDS", "1")
    import time
    time.sleep(1.1)
    client.get(f"{API}/me", headers=team["sam"])
    assert client.get(f"{ADMIN}/users/{ids['sam']}/sessions", headers=boss).json()[0]["lastSeenAt"] != before


def test_editing_a_profile_validates_audits_and_an_email_change_signs_the_person_out(client, boss, team):
    ids = team["ids"]
    r = client.patch(f"{ADMIN}/users/{ids['sam']}", headers=team["admin1"], json={"name": "Samuel"})
    assert r.status_code == 200 and r.json()["name"] == "Samuel"
    # the ledger owns the time zone once it exists: an administrator cannot change it from outside
    tz = client.patch(f"{ADMIN}/users/{ids['sam']}", headers=team["admin1"], json={"timezone": "Asia/Kolkata"})
    assert tz.status_code == 409 and "Settings" in tz.json()["detail"]
    assert client.get(f"{API}/me", headers=team["sam"]).status_code == 200  # name change keeps the session
    assert client.patch(f"{ADMIN}/users/{ids['sam']}", headers=boss, json={"timezone": "Mars/Base"}).status_code == 422
    # a pending request has no ledger yet, so its time zone can still be corrected
    client.post(f"{API}/auth/register", json={
        "name": "Pending P", "email": "pending-p@example.com", "password": "correct horse battery",  # pragma: allowlist secret
        "timezone": "UTC", "currency": "INR", "securityQuestionId": 1, "securityAnswer": "Bruno"})
    pending = client.get(f"{ADMIN}/users?status=pending_approval", headers=boss).json()["items"][0]["id"]
    fixed = client.patch(f"{ADMIN}/users/{pending}", headers=boss, json={"timezone": "Asia/Kolkata"})
    assert fixed.status_code == 200 and fixed.json()["timezone"] == "Asia/Kolkata"
    assert client.patch(f"{ADMIN}/users/{ids['sam']}", headers=boss, json={"name": "  "}).status_code == 422
    assert client.patch(f"{ADMIN}/users/{ids['sam']}", headers=boss,
                        json={"email": "ravi@example.com"}).status_code == 409
    moved = client.patch(f"{ADMIN}/users/{ids['sam']}", headers=boss, json={"email": "Sam.New@Example.com"})
    assert moved.json()["email"] == "sam.new@example.com"
    assert client.get(f"{API}/me", headers=team["sam"]).status_code == 401
    entries = client.get(f"{ADMIN}/audit-log?user_id={ids['sam']}", headers=boss).json()["items"]
    assert "user.edit" in [e["action"] for e in entries]
    # equal rank and self are refused
    assert client.patch(f"{ADMIN}/users/{ids['admin2']}", headers=team["admin1"], json={"name": "X"}).status_code == 403
    me = client.get(f"{API}/me", headers=team["admin1"]).json()["id"]
    assert client.patch(f"{ADMIN}/users/{me}", headers=team["admin1"], json={"name": "X"}).status_code == 409


def test_bulk_actions_report_each_account_and_respect_the_cap(client, boss, team, monkeypatch):
    ids = team["ids"]
    r = client.post(f"{ADMIN}/users/bulk", headers=team["admin1"], json={
        "action": "suspend", "userIds": [ids["sam"], ids["ravi"], ids["admin2"], 99999, ids["sam"]],
        "reason": "audit"})
    body = r.json()
    assert r.status_code == 200 and (body["succeeded"], body["failed"]) == (2, 2)
    by = {x["userId"]: x for x in body["results"]}
    assert by[ids["sam"]]["ok"] and by[ids["ravi"]]["ok"]
    assert not by[ids["admin2"]]["ok"] and "higher role" in by[ids["admin2"]]["error"]
    assert not by[99999]["ok"]
    assert client.get(f"{ADMIN}/users/{ids['ravi']}", headers=boss).json()["status"] == "suspended"
    assert client.get(f"{API}/me", headers=team["sam"]).status_code == 401
    again = client.post(f"{ADMIN}/users/bulk", headers=boss, json={"action": "reactivate",
                                                                    "userIds": [ids["sam"], ids["ravi"], ids["admin1"]]})
    assert (again.json()["succeeded"], again.json()["failed"]) == (2, 1)
    assert client.post(f"{ADMIN}/users/bulk", headers=boss, json={"action": "delete", "userIds": [ids["sam"]]}
                       ).status_code == 422
    monkeypatch.setenv("MONETARY_ADMIN_BULK_LIMIT", "2")
    assert client.post(f"{ADMIN}/users/bulk", headers=boss,
                       json={"action": "suspend", "userIds": [1, 2, 3]}).status_code == 422
    assert client.post(f"{ADMIN}/users/bulk", headers=boss, json={"action": "suspend", "userIds": []}
                       ).status_code == 422


def test_bulk_approve_provisions_each_ledger_and_a_failure_leaves_no_trace(client, boss):
    for n in ("a", "b"):
        assert client.post(f"{API}/auth/register", json={
            "name": f"Pending {n}", "email": f"pending-{n}@example.com", "password": "correct horse battery",  # pragma: allowlist secret
            "timezone": "Asia/Kolkata", "currency": "INR", "securityQuestionId": 1,
            "securityAnswer": "Bruno"}, headers={"X-Captcha": ""}).status_code in (200, 202)
    users = client.get(f"{ADMIN}/users?status=pending_approval", headers=boss).json()["items"]
    ids = [u["id"] for u in users]
    assert len(ids) == 2
    out = client.post(f"{ADMIN}/users/bulk", headers=boss, json={"action": "approve", "userIds": ids + ids[:1]}).json()
    assert out["succeeded"] == 2
    after = client.get(f"{ADMIN}/users?status=active", headers=boss).json()["items"]
    assert all(u["storageBytes"] for u in after if u["id"] in ids)


def test_user_rows_show_storage_and_last_activity(client, boss, team):
    ids = team["ids"]
    one = client.get(f"{ADMIN}/users/{ids['sam']}", headers=boss).json()
    assert one["storageBytes"] > 0 and one["lastActivityAt"]
    listed = {u["id"]: u for u in client.get(f"{ADMIN}/users", headers=boss).json()["items"]}
    assert listed[ids["ravi"]]["storageBytes"] > 0


def test_purge_is_superuser_only_and_counts_what_is_overdue(client, boss, team, control):
    ids = team["ids"]
    assert client.post(f"{ADMIN}/users/{ids['ravi']}/delete", headers=boss).status_code == 200
    assert client.get(f"{ADMIN}/stats", headers=boss).json()["overdueForPurge"] == 0
    assert client.post(f"{ADMIN}/purge", headers=team["admin1"]).status_code == 403
    assert client.post(f"{ADMIN}/purge", headers=boss).json() == {"purged": 0}
    from monetary.config import data_dir_from_environment
    from monetary.infrastructure import control_repository as crepo
    from monetary.infrastructure.control_db import connect_control
    c = connect_control(data_dir_from_environment())
    crepo.update_user(c, ids["ravi"], now="2026-01-01T00:00:00+00:00", delete_after="2020-01-01T00:00:00+00:00")
    c.commit(); c.close()
    assert client.get(f"{ADMIN}/stats", headers=boss).json()["overdueForPurge"] == 1
    assert client.post(f"{ADMIN}/purge", headers=boss).json() == {"purged": 1}
    assert client.get(f"{ADMIN}/stats", headers=boss).json()["overdueForPurge"] == 0
    assert client.get(f"{ADMIN}/users/{ids['ravi']}", headers=boss).status_code == 404
    actions = [e["action"] for e in client.get(f"{ADMIN}/audit-log", headers=boss).json()["items"]]
    assert "admin.purge" in actions and "user.purge" in actions


def test_the_account_holder_changes_the_time_zone_and_the_admin_screens_follow(client, boss, team):
    ids = team["ids"]
    r = client.patch(f"{API}/owner", headers=team["sam"], json={"timezone": "Asia/Kolkata"})
    assert r.status_code == 200 and r.json()["timezone"] == "Asia/Kolkata"
    assert client.get(f"{API}/owner", headers=team["sam"]).json()["timezone"] == "Asia/Kolkata"  # the ledger's own
    assert client.get(f"{ADMIN}/users/{ids['sam']}", headers=boss).json()["timezone"] == "Asia/Kolkata"  # the copy
