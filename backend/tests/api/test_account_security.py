"""Account protections over HTTP: captcha on the public forms, the sign-in lock, honeypot, re-requests."""
from __future__ import annotations

import base64
import hashlib
import json

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


def _login(client, email, password, **kw):
    return client.post(f"{API}/auth/login", data={"username": email, "password": password}, **kw)


@pytest.fixture()
def admin(client):
    return _bearer(client.post(f"{API}/setup/init", json=OWNER).json()["accessToken"])


def _solved(client) -> str:
    ch = client.get(f"{API}/auth/captcha").json()["challenge"]
    number = next(n for n in range(ch["maxnumber"] + 1)
                  if hashlib.sha256(f"{ch['salt']}{n}".encode()).hexdigest() == ch["challenge"])
    return base64.b64encode(json.dumps({**ch, "number": number}).encode()).decode()


@pytest.fixture()
def altcha(monkeypatch):
    monkeypatch.setenv("MONETARY_CAPTCHA_PROVIDER", "altcha")
    monkeypatch.setenv("MONETARY_CAPTCHA_DIFFICULTY", "500")


def test_the_captcha_endpoint_reports_the_provider(client, monkeypatch):
    assert client.get(f"{API}/auth/captcha").json() == {"provider": "none", "challenge": None, "siteKey": None}
    monkeypatch.setenv("MONETARY_CAPTCHA_PROVIDER", "altcha")
    body = client.get(f"{API}/auth/captcha").json()
    assert body["provider"] == "altcha" and set(body["challenge"]) == {"algorithm", "challenge", "salt", "maxnumber", "signature"}


def test_sign_up_and_password_reset_need_a_solved_captcha(client, admin, altcha):
    no = client.post(f"{API}/auth/register", json=RAVI)
    assert (no.status_code, no.json()["error_type"]) == (400, "CaptchaRequired")
    ok = client.post(f"{API}/auth/register", json=RAVI, headers={"X-Captcha": _solved(client)})
    assert ok.status_code == 202
    assert client.get(f"{API}/auth/security-question", params={"email": RAVI["email"]}).status_code == 400
    q = client.get(f"{API}/auth/security-question", params={"email": RAVI["email"]}, headers={"X-Captcha": _solved(client)})
    assert q.status_code == 200
    body = {"email": RAVI["email"], "security_answer": "x", "new_password": "another-password-1"}  # pragma: allowlist secret
    assert client.post(f"{API}/auth/reset-password", json=body).json()["error_type"] == "CaptchaRequired"


def test_a_captcha_solution_cannot_be_reused(client, admin, altcha):
    token = _solved(client)
    assert client.post(f"{API}/auth/register", json=RAVI, headers={"X-Captcha": token}).status_code == 202
    again = client.post(f"{API}/auth/register", json={**RAVI, "email": "other@example.com"}, headers={"X-Captcha": token})
    assert again.status_code == 400


def test_the_honeypot_looks_like_success_but_stores_nothing(client, admin):
    r = client.post(f"{API}/auth/register", json={**RAVI, "website": "http://spam.example"})
    assert r.status_code == 202
    assert client.get(f"{ADMIN}/users", headers=admin, params={"status": "pending_approval"}).json()["total"] == 0


def test_sign_in_needs_a_captcha_only_after_repeated_failures(client, admin, altcha, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_CAPTCHA_AFTER", "2")
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "50")
    bad = lambda **kw: _login(client, OWNER["email"], "wrong-password", **kw)  # noqa: E731
    assert [bad().status_code for _ in range(2)] == [401, 401]
    blocked = bad()
    assert (blocked.status_code, blocked.json()["error_type"]) == (400, "CaptchaRequired")
    assert bad(headers={"X-Captcha": _solved(client)}).status_code == 401  # solved: the password is checked
    good = _login(client, OWNER["email"], OWNER["password"], headers={"X-Captcha": _solved(client)})
    assert good.status_code == 200
    assert _login(client, OWNER["email"], OWNER["password"]).status_code == 200  # success reset the count


def test_the_account_locks_over_http_and_an_admin_can_unlock_it(client, admin, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "3")
    created = client.post(f"{ADMIN}/users", headers=admin, json={"name": "Sam", "email": "sam@example.com", "currency": "INR"}).json()
    temp, sam_id = created["temporaryPassword"], created["user"]["id"]
    assert [_login(client, "sam@example.com", "nope-nope-1").status_code for _ in range(3)] == [401, 401, 401]
    locked = _login(client, "sam@example.com", temp)
    assert (locked.status_code, locked.json()["error_type"]) == (429, "AccountLocked")
    detail = client.get(f"{ADMIN}/users/{sam_id}", headers=admin).json()
    assert detail["lockedUntil"] is not None
    assert client.post(f"{ADMIN}/users/{sam_id}/unlock", headers=admin).json()["lockedUntil"] is None
    assert _login(client, "sam@example.com", temp).status_code == 200


def test_an_expired_temporary_password_is_reported_with_its_own_error(client, admin, api_data_dir):
    from monetary.infrastructure import control_db, control_repository as crepo
    created = client.post(f"{ADMIN}/users", headers=admin, json={"name": "Sam", "email": "sam@example.com", "currency": "INR"}).json()
    conn = control_db.connect_control(api_data_dir)
    crepo.update_user(conn, created["user"]["id"], now="2026-01-01T00:00:00+00:00", password_expires_at="2020-01-01T00:00:00+00:00")  # pragma: allowlist secret
    conn.commit()
    conn.close()
    r = _login(client, "sam@example.com", created["temporaryPassword"])
    assert (r.status_code, r.json()["error_type"]) == (403, "TemporaryPasswordExpired")


def test_a_rejected_request_can_be_resubmitted_until_the_cap_then_reopened_by_an_admin(client, admin, monkeypatch):
    monkeypatch.setenv("MONETARY_MAX_REREQUESTS", "1")
    client.post(f"{API}/auth/register", json=RAVI)
    uid = client.get(f"{ADMIN}/users", headers=admin, params={"status": "pending_approval"}).json()["items"][0]["id"]
    client.post(f"{ADMIN}/users/{uid}/reject", headers=admin, json={"reason": "who are you"})
    notice = _login(client, RAVI["email"], RAVI["password"])
    assert (notice.status_code, notice.json()["error_type"]) == (403, "AccountRejected")
    assert "submit a new request" in notice.json()["detail"]
    assert client.post(f"{API}/auth/register", json=RAVI).status_code == 202  # neutral answer, now pending again
    assert client.get(f"{ADMIN}/users/{uid}", headers=admin).json()["status"] == "pending_approval"
    client.post(f"{ADMIN}/users/{uid}/reject", headers=admin, json={"reason": "no"})
    client.post(f"{API}/auth/register", json=RAVI)
    assert client.get(f"{ADMIN}/users/{uid}", headers=admin).json()["status"] == "rejected"
    final = _login(client, RAVI["email"], RAVI["password"]).json()
    assert final["error_type"] == "AccountRejectedFinal" and "cannot request again" in final["detail"]
    reopened = client.post(f"{ADMIN}/users/{uid}/reopen", headers=admin)
    assert reopened.status_code == 200 and reopened.json()["status"] == "pending_approval"
    assert client.post(f"{ADMIN}/users/{uid}/reopen", headers=admin).status_code == 409


def test_unlock_and_reopen_need_a_superuser(client, admin):
    created = client.post(f"{ADMIN}/users", headers=admin, json={"name": "Sam", "email": "sam@example.com", "currency": "INR"}).json()
    sam = _bearer(_login(client, "sam@example.com", created["temporaryPassword"]).json()["access_token"])
    for action in ("unlock", "reopen"):
        assert client.post(f"{ADMIN}/users/{created['user']['id']}/{action}").status_code == 401
        assert client.post(f"{ADMIN}/users/{created['user']['id']}/{action}", headers=sam).status_code == 403
