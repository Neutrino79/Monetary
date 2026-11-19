"""Account protections: sign-in lock, temporary-password expiry, limited re-requests, captcha rules."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from monetary.application import admin_service, captcha_service, identity_service as acc
from monetary.domain.exceptions import (
    AccountLocked,
    AccountRejected,
    AuthenticationError,
    CaptchaRequired,
    TemporaryPasswordExpired,
    ValidationError,
)
from monetary.infrastructure import control_repository as crepo

SECRET = b"service-test-secret"
REG = dict(name="Asha Rao", email="asha@example.com", password="correct horse", timezone="Asia/Kolkata",  # pragma: allowlist secret
           home_currency_code="INR", security_question_id=1, security_answer="Bruno")  # pragma: allowlist secret
ADMIN = {"id": None}


def _active(control, **over):
    acc.register(control, **{**REG, **over})
    user = crepo.get_user_by_email(control, (over.get("email") or REG["email"]).lower())
    return crepo.update_user(control, user["id"], now="2026-01-01T00:00:00+00:00", status="active")


def _wrong(control, n, email=REG["email"]):
    for _ in range(n):
        with pytest.raises(AuthenticationError):
            acc.login(control, email=email, password="not the password")  # pragma: allowlist secret


# ---- lock ---------------------------------------------------------------------------------------

def test_the_account_locks_after_the_configured_number_of_wrong_passwords(control, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "3")
    _active(control)
    _wrong(control, 3)
    with pytest.raises(AccountLocked, match="Try again in"):
        acc.login(control, email=REG["email"], password=REG["password"])  # even the right one
    assert "user.lockout" in [a["action"] for a in crepo.list_audit(control)]


def test_a_success_resets_the_count_and_the_lock_runs_out(control, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "3")
    user = _active(control)
    _wrong(control, 2)
    acc.login(control, email=REG["email"], password=REG["password"])
    assert crepo.get_user(control, user["id"])["failed_login_count"] == 0
    _wrong(control, 3)
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    crepo.update_user(control, user["id"], now=past, locked_until=past)
    acc.login(control, email=REG["email"], password=REG["password"])


def test_the_lock_length_is_a_setting(control, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "1")
    monkeypatch.setenv("MONETARY_LOGIN_LOCKOUT_MINUTES", "90")
    user = _active(control)
    _wrong(control, 1)
    until = datetime.fromisoformat(crepo.get_user(control, user["id"])["locked_until"])
    assert 88 <= (until - datetime.now(timezone.utc)).total_seconds() / 60 <= 91


def test_a_setting_that_is_not_a_number_falls_back_and_never_below_the_minimum(control, monkeypatch):
    from monetary import config
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "lots")
    assert config.login_max_failures() == 5
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "0")
    assert config.login_max_failures() == 1  # a typo must not switch the lock off


def test_unknown_emails_are_not_locked_and_give_the_same_error(control, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "1")
    for _ in range(3):
        with pytest.raises(AuthenticationError, match="Invalid email or password"):
            acc.login(control, email="ghost@example.com", password="whatever it is")  # pragma: allowlist secret


def test_an_administrator_can_unlock_at_once(control, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "1")
    user = _active(control)
    _wrong(control, 1)
    admin_service.unlock(control, ADMIN, user["id"])
    acc.login(control, email=REG["email"], password=REG["password"])
    assert "user.unlock" in [a["action"] for a in crepo.list_audit(control)]


def test_wrong_security_answers_count_towards_the_same_lock(control, monkeypatch):
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "2")
    _active(control)
    for _ in range(2):
        with pytest.raises(ValidationError):
            acc.reset_password(control, email=REG["email"], security_answer="wrong", new_password="reset password")  # pragma: allowlist secret
    with pytest.raises(AccountLocked):
        acc.reset_password(control, email=REG["email"], security_answer="Bruno", new_password="reset password")  # pragma: allowlist secret


# ---- temporary passwords ------------------------------------------------------------------------

def test_a_temporary_password_stops_working_after_its_lifetime(control, monkeypatch, tmp_path):
    monkeypatch.setenv("MONETARY_TEMP_PASSWORD_HOURS", "24")
    acc.create_superuser(control, name="Root", email="root@example.com", password="correct horse",  # pragma: allowlist secret
                         timezone=None, home_currency_code="INR")
    actor = crepo.get_user_by_email(control, "root@example.com")
    user, temp = admin_service.create_user(control, tmp_path, actor, name="Sam", email="sam@example.com",
                                           timezone=None, home_currency_code="INR")
    stored = crepo.get_user(control, user["id"])
    hours = (datetime.fromisoformat(stored["password_expires_at"]) - datetime.now(timezone.utc)).total_seconds() / 3600
    assert 23 <= hours <= 24.1
    acc.login(control, email="sam@example.com", password=temp)  # still fine

    old = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    crepo.update_user(control, user["id"], now=old, password_expires_at=old)
    with pytest.raises(TemporaryPasswordExpired, match="expired"):
        acc.login(control, email="sam@example.com", password=temp)
    _, fresh = admin_service.reset_password(control, actor, user["id"])
    acc.login(control, email="sam@example.com", password=fresh)  # a reset issues a new lifetime


def test_choosing_a_new_password_clears_the_expiry(control):
    user = _active(control)
    crepo.update_user(control, user["id"], now="2026-01-01T00:00:00+00:00", must_change_password=True,
                      password_expires_at="2020-01-01T00:00:00+00:00")  # pragma: allowlist secret
    acc.reset_password(control, email=REG["email"], security_answer="Bruno", new_password="a brand new pass")  # pragma: allowlist secret
    stored = crepo.get_user(control, user["id"])
    assert stored["password_expires_at"] is None and stored["must_change_password"] == 0


# ---- asking again after a rejection -------------------------------------------------------------

def _reject(control, user_id):
    admin_service.reject(control, ADMIN, user_id, reason="not now")


def test_a_rejected_person_can_ask_again_up_to_the_cap_with_the_same_neutral_answer(control, monkeypatch):
    monkeypatch.setenv("MONETARY_MAX_REREQUESTS", "2")
    acc.register(control, **REG)
    user = crepo.get_user_by_email(control, REG["email"])
    for attempt in (1, 2):
        _reject(control, user["id"])
        assert acc.register(control, **{**REG, "name": f"Asha v{attempt}"}) is None
        again = crepo.get_user(control, user["id"])
        assert (again["status"], again["rerequest_count"], again["name"]) == ("pending_approval", attempt, f"Asha v{attempt}")
        assert again["status_reason"] is None
    _reject(control, user["id"])
    acc.register(control, **{**REG, "name": "Third time"})
    assert crepo.get_user(control, user["id"])["status"] == "rejected"  # over the cap: nothing changes
    with pytest.raises(AccountRejected, match="cannot request again"):
        acc.login(control, email=REG["email"], password=REG["password"])
    assert [a["action"] for a in crepo.list_audit(control)].count("user.re_request") == 2


def test_the_rejection_notice_invites_a_new_request_while_one_is_left(control):
    acc.register(control, **REG)
    user = crepo.get_user_by_email(control, REG["email"])
    _reject(control, user["id"])
    with pytest.raises(AccountRejected, match="submit a new request"):
        acc.login(control, email=REG["email"], password=REG["password"])


def test_an_administrator_can_reopen_a_rejected_request_with_a_fresh_allowance(control, monkeypatch):
    monkeypatch.setenv("MONETARY_MAX_REREQUESTS", "0")
    acc.register(control, **REG)
    user = crepo.get_user_by_email(control, REG["email"])
    _reject(control, user["id"])
    acc.register(control, **REG)
    assert crepo.get_user(control, user["id"])["status"] == "rejected"
    admin_service.reopen(control, ADMIN, user["id"])
    assert crepo.get_user(control, user["id"])["status"] == "pending_approval"
    with pytest.raises(Exception, match="Cannot reopen"):
        admin_service.reopen(control, ADMIN, user["id"])  # only a rejected request can be reopened


def test_only_rejected_requests_are_reopened_by_registering_again(control):
    user = _active(control)
    acc.register(control, **{**REG, "name": "Hijack", "password": "another password"})  # pragma: allowlist secret
    assert crepo.get_user(control, user["id"])["name"] == "Asha Rao"


# ---- captcha ------------------------------------------------------------------------------------

def test_the_captcha_can_be_turned_off_and_an_unknown_provider_is_not_off(control, monkeypatch):
    captcha_service.require(None, SECRET)  # the test environment sets provider=none
    monkeypatch.setenv("MONETARY_CAPTCHA_PROVIDER", "typo")
    with pytest.raises(CaptchaRequired):
        captcha_service.require(None, SECRET)


def test_a_proof_of_work_is_accepted_once(monkeypatch):
    import base64, hashlib, json
    monkeypatch.setenv("MONETARY_CAPTCHA_PROVIDER", "altcha")
    monkeypatch.setenv("MONETARY_CAPTCHA_DIFFICULTY", "300")
    cfg = captcha_service.public_config(SECRET)
    assert cfg["provider"] == "altcha" and cfg["challenge"]["maxnumber"] == 300
    ch = cfg["challenge"]
    number = next(n for n in range(301) if hashlib.sha256(f"{ch['salt']}{n}".encode()).hexdigest() == ch["challenge"])
    token = base64.b64encode(json.dumps({**ch, "number": number}).encode()).decode()
    captcha_service.require(token, SECRET)
    with pytest.raises(CaptchaRequired):
        captcha_service.require(token, SECRET)  # a solution cannot be replayed
    with pytest.raises(CaptchaRequired):
        captcha_service.require("garbage", SECRET)
    with pytest.raises(CaptchaRequired, match="complete the captcha"):
        captcha_service.require(None, SECRET)


def test_turnstile_is_checked_with_cloudflare_and_fails_closed(monkeypatch):
    from monetary.infrastructure import turnstile
    monkeypatch.setenv("MONETARY_CAPTCHA_PROVIDER", "turnstile")
    monkeypatch.setenv("MONETARY_TURNSTILE_SITE_KEY", "site-key")
    assert captcha_service.public_config(SECRET) == {"provider": "turnstile", "challenge": None, "site_key": "site-key"}
    with pytest.raises(CaptchaRequired):
        captcha_service.require("token", SECRET)  # no secret configured: nothing can pass
    monkeypatch.setenv("MONETARY_TURNSTILE_SECRET", "ts-secret")
    seen = {}
    monkeypatch.setattr(turnstile, "verify", lambda token, *, secret, remote_ip: seen.update(t=token, s=secret) or token == "good")
    captcha_service.require("good", SECRET, remote_ip="1.2.3.4")
    assert seen == {"t": "good", "s": "ts-secret"}
    with pytest.raises(CaptchaRequired):
        captcha_service.require("bad", SECRET)
