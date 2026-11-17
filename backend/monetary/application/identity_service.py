"""Platform accounts (control database): registration, login and sessions, passwords, first superuser.

This is the multi-tenant counterpart of the login half of `user_service`. A *platform account* is a
person who can sign in; the ledger they use is a separate database (see `provisioning.py`). Like the
rest of the application layer it never commits: the request dependency owns the transaction.
Superuser actions on other accounts live in `admin_service.py`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone

from monetary.application import audit_service
from monetary.domain.credentials import (
    validate_currency,
    validate_email,
    validate_password,
    validate_security_question,
)
from monetary.domain.enums import PlatformRole, UserStatus
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
from monetary.domain.security import (
    SECURITY_QUESTIONS,
    SESSION_TTL_HOURS,
    SUPERUSER_SESSION_TTL_HOURS,
    generate_session_token,
    hash_password,
    hash_security_answer,
    hash_session_token,
    verify_password,
    verify_security_answer,
)
from monetary.domain.time_utils import utc_now_iso, validate_timezone
from monetary.infrastructure import control_repository as crepo

MAX_PENDING_REGISTRATIONS = 200
PENDING_EXPIRY_DAYS = 30
REJECTED_RETENTION_DAYS = 30

_DUMMY_HASH: str | None = None


def _burn_password_check(password: str) -> None:
    """Spend the same time as a real password check, so an unknown email is not faster to reject."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password("not-a-real-password")
    verify_password(password, _DUMMY_HASH)


def _clean_name(name: str) -> str:
    if not name or not name.strip():
        raise ValidationError("Name is required.")
    return name.strip()


def users_exist(conn) -> bool:
    """True once any platform account exists (first-run setup is only open before that)."""
    return crepo.count_users(conn) > 0


def purge_stale_requests(conn) -> int:
    """Drop registration requests nobody approved in time and old rejected ones."""
    now = datetime.now(dt_timezone.utc)
    return crepo.delete_stale_requests(
        conn,
        pending_before=(now - timedelta(days=PENDING_EXPIRY_DAYS)).isoformat(),
        rejected_before=(now - timedelta(days=REJECTED_RETENTION_DAYS)).isoformat(),
    )


# --------------------------------------------------------------------------- #
# Creating accounts
# --------------------------------------------------------------------------- #

def bootstrap_first_superuser(conn, *, name: str, email: str, password: str, timezone: str | None,
                               home_currency_code: str, security_question_id: int | None = None,
                               security_answer: str | None = None) -> dict:
    """Create the very first account: an active superuser. Refused once any account exists."""
    if users_exist(conn):
        raise ConflictError("Setup has already been completed.")
    return _create_active_superuser(
        conn, name=name, email=email, password=password, timezone=timezone,
        home_currency_code=home_currency_code, security_question_id=security_question_id,
        security_answer=security_answer, actor_user_id=None,
    )


def create_superuser(conn, *, name: str, email: str, password: str, timezone: str | None,
                     home_currency_code: str) -> dict:
    """Create an additional active superuser (command-line tool)."""
    return _create_active_superuser(
        conn, name=name, email=email, password=password, timezone=timezone,
        home_currency_code=home_currency_code, security_question_id=None, security_answer=None,
        actor_user_id=None,
    )


def _create_active_superuser(conn, *, name, email, password, timezone, home_currency_code,
                              security_question_id, security_answer, actor_user_id) -> dict:
    name = _clean_name(name)
    email = validate_email(email)
    validate_password(password)
    validate_timezone(timezone)
    currency = validate_currency(home_currency_code)
    question_hash = None
    if security_question_id is not None or security_answer is not None:
        validate_security_question(security_question_id, security_answer)
        question_hash = hash_security_answer(security_answer)
    if crepo.get_user_by_email(conn, email) is not None:
        raise ConflictError(f"Email already in use: {email}")
    now = utc_now_iso()
    user = crepo.create_user(
        conn, email=email, name=name, password_hash=hash_password(password),
        security_question_id=security_question_id, security_answer_hash=question_hash,
        role=PlatformRole.SUPERUSER.value, status=UserStatus.ACTIVE.value, timezone=timezone,
        home_currency_code=currency, approved_at=now, now=now,
    )
    audit_service.record(conn, actor_user_id=actor_user_id, action="user.create_superuser",
                         target_user_id=user["id"], detail={"email": email})
    return user


def register(conn, *, name: str, email: str, password: str, timezone: str | None,
             home_currency_code: str, security_question_id: int, security_answer: str,
             ip: str | None = None) -> None:
    """Self-registration: store a request that waits for a superuser (`pending_approval`).

    Returns nothing, deliberately: the caller shows the same message whether or not the email was
    already known, so this cannot be used to discover registered emails. No ledger is created yet."""
    name = _clean_name(name)
    email = validate_email(email)
    validate_password(password)
    validate_timezone(timezone)
    currency = validate_currency(home_currency_code)
    validate_security_question(security_question_id, security_answer)

    # Hash first, so a duplicate email costs the same time as a new one.
    password_hash = hash_password(password)
    answer_hash = hash_security_answer(security_answer)

    purge_stale_requests(conn)
    if crepo.get_user_by_email(conn, email) is not None:
        return
    if crepo.count_users(conn, status=UserStatus.PENDING_APPROVAL.value) >= MAX_PENDING_REGISTRATIONS:
        raise RateLimitError("Registration is temporarily unavailable. Please try again later.")
    user = crepo.create_user(
        conn, email=email, name=name, password_hash=password_hash, security_question_id=security_question_id,
        security_answer_hash=answer_hash, role=PlatformRole.USER.value,
        status=UserStatus.PENDING_APPROVAL.value, timezone=timezone, home_currency_code=currency,
        now=utc_now_iso(),
    )
    audit_service.record(conn, actor_user_id=None, action="user.register", target_user_id=user["id"],
                         detail={"email": email}, ip=ip)


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #

def _new_session(conn, user: dict) -> str:
    token = generate_session_token()
    now = datetime.now(dt_timezone.utc)
    hours = SUPERUSER_SESSION_TTL_HOURS if user["role"] == PlatformRole.SUPERUSER.value else SESSION_TTL_HOURS
    crepo.create_session(
        conn, user_id=user["id"], token_hash=hash_session_token(token),
        created_at=now.isoformat(), expires_at=(now + timedelta(hours=hours)).isoformat(),
    )
    crepo.delete_expired_sessions(conn, now.isoformat())  # cheap housekeeping on every login
    return token


def start_session(conn, user: dict) -> str:
    """Open a session for an account that is already authenticated (demo mode, first-run setup)."""
    return _new_session(conn, user)


def _require_active(user: dict) -> None:
    status = user["status"]
    reason = f" Reason: {user['status_reason']}" if user.get("status_reason") else ""
    if status == UserStatus.PENDING_APPROVAL.value:
        raise AccountPendingApproval("Your request is waiting for approval.")
    if status == UserStatus.REJECTED.value:
        raise AccountRejected("Your request was declined." + reason)
    if status == UserStatus.SUSPENDED.value:
        raise AccountSuspended("This account is suspended." + reason)
    if status == UserStatus.PENDING_DELETE.value:
        raise AccountPendingDelete(
            f"This account is scheduled for deletion on {(user.get('delete_after') or '')[:10] or 'a later date'}.")


def login(conn, *, email: str, password: str) -> tuple[dict, str]:
    """Check the credentials, then the account state, and open a session.

    The state is only revealed after a correct password, and a wrong email and a wrong password give
    the same error. Returns (account row, plaintext session token)."""
    user = crepo.get_user_by_email(conn, validate_email(email))
    if user is None or user["password_hash"] is None:
        _burn_password_check(password)
        raise AuthenticationError("Invalid email or password.")
    if not verify_password(password, user["password_hash"]):
        raise AuthenticationError("Invalid email or password.")
    _require_active(user)
    now = utc_now_iso()
    user = crepo.update_user(conn, user["id"], now=now, last_login_at=now)
    return user, _new_session(conn, user)


def logout(conn, plaintext_token: str) -> None:
    session = crepo.get_session_by_token_hash(conn, hash_session_token(plaintext_token))
    if session is not None:
        crepo.delete_session(conn, session["id"])


def verify_session(conn, plaintext_token: str) -> dict | None:
    """The account behind a session token, or None when the token is unknown, expired, or the account
    is no longer active. Roles and states are read fresh on every call; the token carries no claims."""
    if not plaintext_token:
        return None
    session = crepo.get_session_by_token_hash(conn, hash_session_token(plaintext_token))
    if session is None:
        return None
    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=dt_timezone.utc)
    if expires_at < datetime.now(dt_timezone.utc):
        crepo.delete_session(conn, session["id"])
        return None
    user = crepo.get_user(conn, session["user_id"])
    if user is None or user["status"] != UserStatus.ACTIVE.value:
        return None
    return user


def get_account_or_raise(conn, user_id: int) -> dict:
    user = crepo.get_user(conn, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} not found.")
    return user


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #

def change_password(conn, user: dict, *, current_password: str, new_password: str) -> None:
    """Needs the current password even for a signed-in caller (defends against a hijacked session).
    Ends every session, including the caller's own, and clears a forced-change flag."""
    if user["password_hash"] is None or not verify_password(current_password, user["password_hash"]):
        raise ValidationError("Current password is incorrect.")
    validate_password(new_password)
    crepo.update_user(conn, user["id"], now=utc_now_iso(), password_hash=hash_password(new_password),
                      must_change_password=False)
    crepo.delete_sessions_for_user(conn, user["id"])


def get_security_question(conn, email: str) -> tuple[int, str]:
    user = crepo.get_user_by_email(conn, validate_email(email))
    if user is None or user["status"] != UserStatus.ACTIVE.value or user["security_question_id"] is None:
        raise NotFoundError("No account with that email has a security question set.")
    question_id = user["security_question_id"]
    return question_id, SECURITY_QUESTIONS[question_id]


def reset_password(conn, *, email: str, security_answer: str, new_password: str) -> None:
    user = crepo.get_user_by_email(conn, validate_email(email))
    if (user is None or user["status"] != UserStatus.ACTIVE.value or user["security_answer_hash"] is None
            or not verify_security_answer(security_answer, user["security_answer_hash"])):
        raise ValidationError("Invalid email or security answer.")
    validate_password(new_password)
    crepo.update_user(conn, user["id"], now=utc_now_iso(), password_hash=hash_password(new_password),
                      must_change_password=False)
    crepo.delete_sessions_for_user(conn, user["id"])
