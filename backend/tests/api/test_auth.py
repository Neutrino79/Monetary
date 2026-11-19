import sqlite3

import pytest

from tests.support.sample_data import API, OWNER


def login(anon, email=OWNER["email"], password=OWNER["password"]):
    return anon.client.post(f"{API}/auth/login", data={"username": email, "password": password})


# ---------------------------------------------------------------- setup ----
def test_setup_init_creates_owner_and_returns_token(anon):
    r = anon.post("/setup/init", json=OWNER)
    assert r.status_code == 201
    body = r.json()
    assert body["owner"]["email"] == OWNER["email"] and body["owner"]["ledgerMode"] == "DIRECT"
    assert body["tokenType"] == "bearer" and body["accessToken"].startswith("ets_")
    assert "password" not in r.text and "hash" not in r.text


def test_setup_init_only_once(anon):
    assert anon.post("/setup/init", json=OWNER).status_code == 201
    r = anon.post("/setup/init", json={**OWNER, "email": "other@example.com"})
    assert r.status_code == 409 and r.json()["error_type"] == "ConflictError"


@pytest.mark.parametrize("patch", [
    {"email": "not-an-email"}, {"password": "short"}, {"password": "x" * 129},
    {"security_question_id": 6}, {"security_question_id": 0}, {"currency": "IN"}, {"currency": "INR1"},
    {"timezone": "Mars/Base"}, {"timezone": "/etc/passwd"}, {"name": "  "}, {"security_answer": "  "},
])
def test_setup_init_validation(anon, patch):
    r = anon.post("/setup/init", json={**OWNER, **patch})
    assert r.status_code == 422, r.text


def test_setup_init_missing_fields(anon):
    assert anon.post("/setup/init", json={}).status_code == 422


# ---------------------------------------------------------------- login ----
def test_login_success_and_token_works(anon):
    anon.post("/setup/init", json=OWNER)
    r = login(anon)
    assert r.status_code == 200 and r.json()["token_type"] == "bearer"
    anon.token = r.json()["access_token"]
    assert anon.get("/owner").json()["email"] == OWNER["email"]


def test_login_email_is_case_insensitive(anon):
    anon.post("/setup/init", json=OWNER)
    assert login(anon, email=OWNER["email"].upper()).status_code == 200


def test_bad_password_and_unknown_email_are_indistinguishable(anon):
    anon.post("/setup/init", json=OWNER)
    a, b = login(anon, password="wrong-password"), login(anon, email="ghost@example.com")
    assert a.status_code == b.status_code == 401 and a.json() == b.json()
    assert a.headers["www-authenticate"] == "Bearer"


def test_login_expects_form_not_json(anon):
    anon.post("/setup/init", json=OWNER)
    r = anon.post("/auth/login", json={"username": OWNER["email"], "password": OWNER["password"]})
    assert r.status_code == 422


def test_login_rate_limit_kicks_in_after_10_attempts(anon, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "1000")  # isolate the per-address limiter from the account lock
    anon.post("/setup/init", json=OWNER)
    codes = [login(anon, password="wrong-password").status_code for _ in range(12)]
    assert codes[:10] == [401] * 10 and codes[10:] == [429, 429]
    r = login(anon)                                   # even the right password is throttled
    assert r.status_code == 429 and r.json()["error_type"] == "RateLimitError"


# ------------------------------------------------------------- sessions ----
def test_missing_or_garbage_token_is_401(api):
    assert api.get("/owner", headers={"Authorization": "Bearer garbage"}).status_code == 401
    assert api.client.get(API + "/owner").status_code == 401
    assert api.get("/owner", headers={"Authorization": "Basic abc"}).status_code == 401


def test_logout_invalidates_only_that_session(api, anon):
    other = login(anon).json()["access_token"]
    assert api.post("/auth/logout").status_code == 200
    assert api.get("/owner").status_code == 401
    assert api.get("/owner", headers={"Authorization": f"Bearer {other}"}).status_code == 200


def test_expired_session_is_rejected_and_purged(api, api_data_dir):
    c = sqlite3.connect(api_data_dir / "control.db")
    c.execute("UPDATE session SET expires_at = '2000-01-01T00:00:00+00:00'"); c.commit()
    assert api.get("/owner").status_code == 401
    assert c.execute("SELECT COUNT(*) FROM session").fetchone()[0] == 0
    c.close()


def test_secrets_are_not_stored_in_plaintext(api, api_data_dir):
    c = sqlite3.connect(api_data_dir / "control.db")
    pw, ans = c.execute("SELECT password_hash, security_answer_hash FROM user").fetchone()
    tok = c.execute("SELECT token_hash FROM session").fetchone()[0]
    assert pw.startswith("$2") and ans.startswith("$2")
    assert OWNER["password"] not in pw and api.token != tok and len(tok) == 64
    c.close()


# -------------------------------------------------------- change password ---
def test_change_password_invalidates_every_session(api, anon):
    other = login(anon).json()["access_token"]
    r = api.post("/auth/change-password", json={"current_password": OWNER["password"], "new_password": "brand-new-pass"})
    assert r.status_code == 200
    assert api.get("/owner").status_code == 401
    assert api.get("/owner", headers={"Authorization": f"Bearer {other}"}).status_code == 401
    assert login(anon).status_code == 401 and login(anon, password="brand-new-pass").status_code == 200


@pytest.mark.parametrize("payload,code", [
    ({"current_password": "wrong-password", "new_password": "brand-new-pass"}, 422),
    ({"current_password": OWNER["password"], "new_password": "short"}, 422),
    ({"current_password": OWNER["password"], "new_password": "x" * 129}, 422),
])
def test_change_password_rejections(api, payload, code):
    assert api.post("/auth/change-password", json=payload).status_code == code
    assert api.get("/owner").status_code == 200        # session untouched on failure


# --------------------------------------------------------- password reset ---
def test_reset_flow(anon):
    anon.post("/setup/init", json=OWNER)
    q = anon.get("/auth/security-question", params={"email": OWNER["email"]}).json()
    assert q["securityQuestionId"] == 1 and "pet" in q["question"]
    r = anon.post("/auth/reset-password", json={"email": OWNER["email"], "security_answer": "  WHISKERS ",
                                                 "new_password": "reset-password-1"})
    assert r.status_code == 200
    assert login(anon, password="reset-password-1").status_code == 200


def test_reset_invalidates_existing_sessions(api, anon):
    anon.post("/auth/reset-password", json={"email": OWNER["email"], "security_answer": "whiskers",
                                            "new_password": "reset-password-1"})
    assert api.get("/owner").status_code == 401


def test_reset_wrong_answer_and_unknown_email_look_identical(anon):
    anon.post("/setup/init", json=OWNER)
    a = anon.post("/auth/reset-password", json={"email": OWNER["email"], "security_answer": "nope", "new_password": "reset-password-1"})
    b = anon.post("/auth/reset-password", json={"email": "ghost@example.com", "security_answer": "nope", "new_password": "reset-password-1"})
    assert a.status_code == b.status_code == 422 and a.json() == b.json()


def test_security_question_for_an_unknown_email_is_a_stable_decoy(anon):
    """Asking about an email nobody registered must look like asking about a real one."""
    first = anon.get("/auth/security-question", params={"email": "ghost@example.com"})
    again = anon.get("/auth/security-question", params={"email": "Ghost@Example.com"})
    assert first.status_code == 200 and first.json() == again.json()
    assert first.json()["securityQuestionId"] in {1, 2, 3, 4, 5}


def test_reset_endpoints_are_rate_limited(anon):
    codes = [anon.get("/auth/security-question", params={"email": "ghost@example.com"}).status_code for _ in range(12)]
    assert codes[:10] == [200] * 10 and codes[10:] == [429, 429]


def test_security_questions_list_is_public(anon):
    r = anon.get("/auth/security-questions")
    assert r.status_code == 200 and [q["id"] for q in r.json()] == [1, 2, 3, 4, 5]


# ------------------------------------------------------------------ owner ---
def test_owner_profile_updates(api):
    r = api.patch("/owner", json={"name": "New Name", "timezone": "America/New_York", "ledger_mode": "STRICT"})
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["timezone"], r.json()["ledgerMode"]) == ("New Name", "America/New_York", "STRICT")
    assert api.get("/owner").json()["ledgerMode"] == "STRICT"


@pytest.mark.parametrize("patch", [{"ledger_mode": "LOOSE"}, {"timezone": "Mars/Base"}, {"timezone": "/etc/passwd"}, {"name": "  "}])
def test_owner_update_rejections(api, patch):
    assert api.patch("/owner", json=patch).status_code == 422


def test_empty_owner_patch_is_a_noop(api):
    assert api.patch("/owner", json={}).status_code == 200
