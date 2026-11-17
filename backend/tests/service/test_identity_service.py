"""Platform accounts: registration, login outcomes per state, sessions, passwords, first superuser."""
from datetime import datetime, timedelta, timezone

import pytest

from monetary.application import identity_service as acc
from monetary.domain.exceptions import (
    AccountPendingApproval,
    AccountPendingDelete,
    AccountRejected,
    AccountSuspended,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)
from monetary.infrastructure import control_repository as crepo

REG = dict(name="Asha Rao", email="Asha@Example.com", password="correct horse", timezone="Asia/Kolkata",  # pragma: allowlist secret
           home_currency_code="inr", security_question_id=1, security_answer="Bruno")  # pragma: allowlist secret


def _register(control, **over):
    acc.register(control, **{**REG, **over})
    return crepo.get_user_by_email(control, (over.get("email") or REG["email"]).lower())


def _activate(control, user, **fields):
    return crepo.update_user(control, user["id"], now="2026-01-01T00:00:00+00:00", status="active", **fields)


def test_registering_stores_a_pending_request_with_the_chosen_password_and_no_ledger(control):
    assert acc.register(control, **REG) is None
    u = crepo.get_user_by_email(control, "asha@example.com")
    assert (u["status"], u["role"], u["name"], u["home_currency_code"]) == ("pending_approval", "user", "Asha Rao", "INR")
    assert u["password_hash"] and u["password_hash"] != REG["password"]
    assert crepo.get_workspace_for_user(control, u["id"]) is None
    assert [r["action"] for r in crepo.list_audit(control)] == ["user.register"]


def test_registering_a_known_email_changes_nothing_and_says_nothing(control):
    u = _register(control)
    acc.register(control, **{**REG, "name": "Someone Else", "password": "another password"})  # pragma: allowlist secret
    assert crepo.count_users(control) == 1
    assert crepo.get_user(control, u["id"])["name"] == "Asha Rao"
    assert len(crepo.list_audit(control)) == 1


@pytest.mark.parametrize("over", [{"email": "nope"}, {"password": "short"}, {"name": "  "},  # pragma: allowlist secret
                                  {"home_currency_code": "RUPEE"}, {"timezone": "Mars/Base"},
                                  {"security_question_id": 99}, {"security_answer": " "}])
def test_registration_validates_its_input(control, over):
    with pytest.raises(ValidationError):
        acc.register(control, **{**REG, **over})
    assert crepo.count_users(control) == 0


def test_registration_stops_at_the_pending_cap(control, monkeypatch):
    monkeypatch.setattr(acc, "MAX_PENDING_REGISTRATIONS", 2)
    _register(control, email="a@example.com")
    _register(control, email="b@example.com")
    with pytest.raises(RateLimitError):
        acc.register(control, **{**REG, "email": "c@example.com"})


def test_unapproved_requests_expire_and_free_the_email(control):
    old = (datetime.now(timezone.utc) - timedelta(days=acc.PENDING_EXPIRY_DAYS + 1)).isoformat()
    crepo.create_user(control, email="asha@example.com", name="Old", password_hash="h", role="user",  # pragma: allowlist secret
                      status="pending_approval", now=old)
    acc.register(control, **REG)
    assert crepo.get_user_by_email(control, "asha@example.com")["name"] == "Asha Rao"


# ---- login ---------------------------------------------------------------------------------------

def test_an_active_user_logs_in_with_a_normalised_email(control):
    u = _activate(control, _register(control))
    user, token = acc.login(control, email="  ASHA@example.com ", password=REG["password"])
    assert user["id"] == u["id"] and user["last_login_at"] and token.startswith("ets_")
    assert acc.verify_session(control, token)["id"] == u["id"]


@pytest.mark.parametrize("email,password", [("asha@example.com", "wrong password"), ("nobody@example.com", "whatever pass")])
def test_a_wrong_email_and_a_wrong_password_look_the_same(control, email, password):
    _activate(control, _register(control))
    with pytest.raises(AuthenticationError, match="Invalid email or password"):
        acc.login(control, email=email, password=password)


@pytest.mark.parametrize("status,error", [
    ("pending_approval", AccountPendingApproval), ("rejected", AccountRejected),
    ("suspended", AccountSuspended), ("pending_delete", AccountPendingDelete)])
def test_every_non_active_state_is_refused_only_after_a_correct_password(control, status, error):
    u = _register(control)
    crepo.update_user(control, u["id"], now="2026-01-01T00:00:00+00:00", status=status, status_reason="because")
    with pytest.raises(AuthenticationError):
        acc.login(control, email=REG["email"], password="wrong password")  # state not revealed  # pragma: allowlist secret
    with pytest.raises(error):
        acc.login(control, email=REG["email"], password=REG["password"])
    assert crepo.count_users(control) == 1 and control.execute("SELECT COUNT(*) FROM session").fetchone()[0] == 0


def test_the_refusal_includes_the_reason_the_superuser_gave(control):
    u = _register(control)
    crepo.update_user(control, u["id"], now="2026-01-01T00:00:00+00:00", status="rejected", status_reason="duplicate")
    with pytest.raises(AccountRejected, match="duplicate"):
        acc.login(control, email=REG["email"], password=REG["password"])


def test_an_account_without_a_password_cannot_log_in(control):
    crepo.create_user(control, email="demo@example.com", name="Demo", password_hash=None, role="user",
                      status="active", now="2026-01-01T00:00:00+00:00")
    with pytest.raises(AuthenticationError):
        acc.login(control, email="demo@example.com", password="anything at all")  # pragma: allowlist secret


def test_superuser_sessions_are_shorter_than_user_sessions(control):
    sup = crepo.create_user(control, email="s@example.com", name="S", role="superuser", status="active",
                            password_hash=acc.hash_password("correct horse"), now="2026-01-01T00:00:00+00:00")
    usr = _activate(control, _register(control))
    _, t1 = acc.login(control, email="s@example.com", password="correct horse")  # pragma: allowlist secret
    _, t2 = acc.login(control, email=usr["email"], password=REG["password"])
    ttl = lambda tok: (datetime.fromisoformat(crepo.get_session_by_token_hash(control, acc.hash_session_token(tok))["expires_at"])
                       - datetime.now(timezone.utc))
    assert timedelta(hours=23) < ttl(t1) <= timedelta(hours=24)
    assert timedelta(days=6) < ttl(t2) <= timedelta(days=7)
    assert sup["role"] == "superuser"


# ---- sessions ------------------------------------------------------------------------------------

def test_a_suspended_account_loses_access_even_with_a_live_token(control):
    u = _activate(control, _register(control))
    _, token = acc.login(control, email=REG["email"], password=REG["password"])
    crepo.update_user(control, u["id"], now="2026-01-01T00:00:00+00:00", status="suspended")
    assert acc.verify_session(control, token) is None


def test_the_role_is_read_fresh_from_the_database_not_from_the_token(control):
    u = _activate(control, _register(control))
    _, token = acc.login(control, email=REG["email"], password=REG["password"])
    crepo.update_user(control, u["id"], now="2026-01-01T00:00:00+00:00", role="superuser")
    assert acc.verify_session(control, token)["role"] == "superuser"


def test_expired_unknown_and_empty_tokens_are_rejected_and_expired_ones_removed(control):
    u = _activate(control, _register(control))
    crepo.create_session(control, user_id=u["id"], token_hash=acc.hash_session_token("ets_old"),
                         created_at="2020-01-01T00:00:00+00:00", expires_at="2020-01-02T00:00:00+00:00")
    assert acc.verify_session(control, "ets_old") is None
    assert crepo.get_session_by_token_hash(control, acc.hash_session_token("ets_old")) is None
    assert acc.verify_session(control, "ets_unknown") is None and acc.verify_session(control, "") is None


def test_logout_ends_only_that_session(control):
    _activate(control, _register(control))
    _, a = acc.login(control, email=REG["email"], password=REG["password"])
    _, b = acc.login(control, email=REG["email"], password=REG["password"])
    acc.logout(control, a)
    acc.logout(control, "ets_not_a_session")
    assert acc.verify_session(control, a) is None and acc.verify_session(control, b) is not None


# ---- passwords -----------------------------------------------------------------------------------

def test_changing_the_password_needs_the_current_one_ends_all_sessions_and_clears_the_forced_flag(control):
    u = _activate(control, _register(control), must_change_password=True)
    _, token = acc.login(control, email=REG["email"], password=REG["password"])
    with pytest.raises(ValidationError, match="Current password"):
        acc.change_password(control, u, current_password="not it at all", new_password="a brand new pass")  # pragma: allowlist secret
    with pytest.raises(ValidationError):
        acc.change_password(control, u, current_password=REG["password"], new_password="short")  # pragma: allowlist secret
    acc.change_password(control, u, current_password=REG["password"], new_password="a brand new pass")  # pragma: allowlist secret
    assert acc.verify_session(control, token) is None
    user, _ = acc.login(control, email=REG["email"], password="a brand new pass")  # pragma: allowlist secret
    assert user["must_change_password"] == 0


def test_the_security_question_flow_resets_the_password_for_active_accounts_only(control):
    u = _register(control)
    with pytest.raises(NotFoundError):
        acc.get_security_question(control, REG["email"])  # still pending
    with pytest.raises(ValidationError):
        acc.reset_password(control, email=REG["email"], security_answer="Bruno", new_password="reset password")  # pragma: allowlist secret
    _activate(control, u)
    qid, text = acc.get_security_question(control, REG["email"])
    assert qid == 1 and "pet" in text
    with pytest.raises(ValidationError):
        acc.reset_password(control, email=REG["email"], security_answer="Rex", new_password="reset password")  # pragma: allowlist secret
    _, token = acc.login(control, email=REG["email"], password=REG["password"])
    acc.reset_password(control, email=REG["email"], security_answer=" bruno ", new_password="reset password")  # pragma: allowlist secret
    assert acc.verify_session(control, token) is None
    acc.login(control, email=REG["email"], password="reset password")  # pragma: allowlist secret


def test_accounts_without_a_security_question_cannot_use_the_reset_flow(control):
    acc.create_superuser(control, name="Root", email="root@example.com", password="correct horse",  # pragma: allowlist secret
                         timezone=None, home_currency_code="INR")
    with pytest.raises(NotFoundError):
        acc.get_security_question(control, "root@example.com")
    with pytest.raises(ValidationError):
        acc.reset_password(control, email="root@example.com", security_answer="x", new_password="reset password")  # pragma: allowlist secret


# ---- first superuser -----------------------------------------------------------------------------

def test_the_first_superuser_is_active_and_setup_closes_afterwards(control):
    assert acc.users_exist(control) is False
    u = acc.bootstrap_first_superuser(control, name="Owner", email="Owner@Example.com", password="correct horse",  # pragma: allowlist secret
                                      timezone="UTC", home_currency_code="usd",
                                      security_question_id=2, security_answer="Smith")  # pragma: allowlist secret
    assert (u["role"], u["status"], u["email"], u["home_currency_code"]) == ("superuser", "active", "owner@example.com", "USD")
    assert acc.users_exist(control) is True
    with pytest.raises(ConflictError, match="already been completed"):
        acc.bootstrap_first_superuser(control, name="Mallory", email="m@example.com", password="correct horse",  # pragma: allowlist secret
                                      timezone="UTC", home_currency_code="USD")
    assert [r["action"] for r in crepo.list_audit(control)] == ["user.create_superuser"]


def test_creating_a_superuser_rejects_a_duplicate_email_and_a_half_given_question(control):
    acc.create_superuser(control, name="Root", email="root@example.com", password="correct horse",  # pragma: allowlist secret
                         timezone=None, home_currency_code="INR")
    with pytest.raises(ConflictError):
        acc.create_superuser(control, name="Root 2", email="ROOT@example.com", password="correct horse",  # pragma: allowlist secret
                             timezone=None, home_currency_code="INR")
    with pytest.raises(ValidationError):
        acc._create_active_superuser(
            control, name="X", email="x@example.com", password="correct horse", timezone=None,  # pragma: allowlist secret
            home_currency_code="INR", security_question_id=1, security_answer=None, actor_user_id=None)


def test_a_missing_account_is_reported(control):
    with pytest.raises(NotFoundError):
        acc.get_account_or_raise(control, 12345)
