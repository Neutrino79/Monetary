"""Platform accounts (control database): registration, login and sessions, passwords, first superuser.

This is the multi-tenant counterpart of the login half of `user_service`. A *platform account* is a
person who can sign in; the ledger they use is a separate database (see `provisioning.py`). Like the
rest of the application layer it never commits: the request dependency owns the transaction.
Superuser actions on other accounts live in `admin_service.py`.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone as dt_timezone

from monetary import config
from monetary.application import audit_service
from monetary.domain import captcha as captcha_math
from monetary.domain.credentials import (
    validate_currency,
    validate_email,
    validate_password,
    validate_security_question,
)
from monetary.domain.enums import PlatformRole, UserStatus
from monetary.domain.exceptions import (
    AccountLocked,
    AccountPendingApproval,
    AccountPendingDelete,
    AccountRejected,
    AccountRejectedFinal,
    AccountSuspended,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    RateLimitError,
    TemporaryPasswordExpired,
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
    crepo.begin_immediate(conn)  # the check and the insert must not race a second setup request
    if users_exist(conn):
        raise ConflictError("Setup has already been completed.")
    return _create_active_superuser(
        conn, name=name, email=email, password=password, timezone=timezone,
        home_currency_code=home_currency_code, security_question_id=security_question_id,
        security_answer=security_answer, actor_user_id=None,
    )


def create_superuser(conn, *, name: str, email: str, password: str, timezone: str | None,
                     home_currency_code: str) -> dict:
    """Create the superuser from the command line. There is exactly one superuser per installation:
    once one exists this is refused (use `transfer_superuser` to hand the role over)."""
    if crepo.count_superusers(conn) > 0:
        raise ConflictError("A superuser already exists. There can be only one; use transfer-superuser "
                            "to hand the role to someone else.")
    return _create_active_superuser(
        conn, name=name, email=email, password=password, timezone=timezone,
        home_currency_code=home_currency_code, security_question_id=None, security_answer=None,
        actor_user_id=None,
    )


def transfer_superuser(conn, *, to_email: str, demote_to: str = PlatformRole.ADMIN.value) -> dict:
    """Hand the single superuser role to another active account (command-line tool, also the way back in
    when the superuser is lost). The former superuser(s) become `demote_to` ('admin' or 'user'); every
    session of the people involved ends. Returns the new superuser."""
    if demote_to not in (PlatformRole.ADMIN.value, PlatformRole.USER.value):
        raise ValidationError("The former superuser can become 'admin' or 'user'.")
    target = crepo.get_user_by_email(conn, validate_email(to_email))
    if target is None:
        raise NotFoundError(f"No account with email {to_email}.")
    if target["status"] != UserStatus.ACTIVE.value:
        raise ConflictError(f"Only an active account can become the superuser (this one is {target['status']}).")
    if target["role"] == PlatformRole.SUPERUSER.value and crepo.count_superusers(conn) == 1:
        raise ConflictError(f"{target['email']} is already the superuser.")
    now = utc_now_iso()
    previous = crepo.list_superusers(conn)
    for old in previous:  # demote first: the database allows only one superuser row at a time
        crepo.update_user(conn, old["id"], now=now, role=demote_to)
        crepo.delete_sessions_for_user(conn, old["id"])
    user = crepo.update_user(conn, target["id"], now=now, role=PlatformRole.SUPERUSER.value)
    crepo.delete_sessions_for_user(conn, target["id"])
    audit_service.record(conn, actor_user_id=None, action="user.transfer_superuser", target_user_id=target["id"],
                         detail={"from": [o["email"] for o in previous], "demoted_to": demote_to})
    return user


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
    existing = crepo.get_user_by_email(conn, email)
    if existing is not None:
        # A rejected person may ask again a limited number of times; the answer stays the same neutral
        # message, so this does not reveal that the email is known.
        if (existing["status"] == UserStatus.REJECTED.value
                and existing["rerequest_count"] < config.max_rerequests()):
            crepo.update_user(
                conn, existing["id"], now=utc_now_iso(), name=name, password_hash=password_hash,
                security_question_id=security_question_id, security_answer_hash=answer_hash,
                timezone=timezone, home_currency_code=currency, status=UserStatus.PENDING_APPROVAL.value,
                status_reason=None, must_change_password=False, rerequest_count=existing["rerequest_count"] + 1,
                failed_login_count=0, locked_until=None)
            audit_service.record(conn, actor_user_id=None, action="user.re_request",
                                 target_user_id=existing["id"],
                                 detail={"email": email, "attempt": existing["rerequest_count"] + 1}, ip=ip)
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

def _new_session(conn, user: dict, *, ip: str | None = None, user_agent: str | None = None) -> str:
    token = generate_session_token()
    now = datetime.now(dt_timezone.utc)
    hours = SUPERUSER_SESSION_TTL_HOURS if user["role"] != PlatformRole.USER.value else SESSION_TTL_HOURS
    crepo.create_session(
        conn, user_id=user["id"], token_hash=hash_session_token(token),
        created_at=now.isoformat(), expires_at=(now + timedelta(hours=hours)).isoformat(),
        ip=ip, user_agent=(user_agent or None) and user_agent[:200],
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
        if user.get("rerequest_count", 0) >= config.max_rerequests():
            raise AccountRejectedFinal("Your request was declined." + reason
                                       + " You cannot request again; please contact an administrator.")
        raise AccountRejected("Your request was declined." + reason + " You can submit a new request.")
    if status == UserStatus.SUSPENDED.value:
        raise AccountSuspended("This account is suspended." + reason)
    if status == UserStatus.PENDING_DELETE.value:
        raise AccountPendingDelete(
            f"This account is scheduled for deletion on {(user.get('delete_after') or '')[:10] or 'a later date'}.")


def _lock_minutes_left(user: dict, now: datetime) -> int:
    """Whole minutes until the account unlocks, or 0 when it is not locked."""
    until = user.get("locked_until")
    if not until:
        return 0
    when = datetime.fromisoformat(until)
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt_timezone.utc)
    return max(0, math.ceil((when - now).total_seconds() / 60))


def _raise_if_locked(user: dict) -> None:
    minutes = _lock_minutes_left(user, datetime.now(dt_timezone.utc))
    if minutes:
        raise AccountLocked(f"Too many failed attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.")


def _record_failed_attempt(conn, user: dict) -> None:
    """Count a wrong password (or wrong security answer); lock the account when the limit is reached."""
    count = user["failed_login_count"] + 1
    if count >= config.login_max_failures():
        until = (datetime.now(dt_timezone.utc) + timedelta(minutes=config.login_lockout_minutes())).isoformat(
            timespec="seconds")
        crepo.update_user(conn, user["id"], now=utc_now_iso(), failed_login_count=0, locked_until=until)
        audit_service.record(conn, actor_user_id=None, action="user.lockout", target_user_id=user["id"],
                             detail={"until": until})
    else:
        crepo.update_user(conn, user["id"], now=utc_now_iso(), failed_login_count=count)


def _temporary_password_expired(user: dict) -> bool:
    expires = user.get("password_expires_at")
    if not user["must_change_password"] or not expires:
        return False
    when = datetime.fromisoformat(expires)
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt_timezone.utc)
    return when < datetime.now(dt_timezone.utc)


def login(conn, *, email: str, password: str, ip: str | None = None,
          user_agent: str | None = None) -> tuple[dict, str]:
    """Check the credentials, then the account state, and open a session.

    The state is only revealed after a correct password, and a wrong email and a wrong password give
    the same error. Wrong passwords are counted per account and lock it for a while. Returns
    (account row, plaintext session token). The caller must commit when this raises
    AuthenticationError, because the failed attempt has to be remembered."""
    user = crepo.get_user_by_email(conn, validate_email(email))
    if user is None or user["password_hash"] is None:
        _burn_password_check(password)
        raise AuthenticationError("Invalid email or password.")
    _raise_if_locked(user)
    if not verify_password(password, user["password_hash"]):
        _record_failed_attempt(conn, user)
        raise AuthenticationError("Invalid email or password.")
    _require_active(user)
    if _temporary_password_expired(user):
        raise TemporaryPasswordExpired("Your temporary password has expired. Ask an administrator for a new one.")
    now = utc_now_iso()
    user = crepo.update_user(conn, user["id"], now=now, last_login_at=now, failed_login_count=0,
                             locked_until=None)
    return user, _new_session(conn, user, ip=ip, user_agent=user_agent)


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
    _touch(conn, session)
    return user


def _touch(conn, session: dict) -> None:
    """Refresh "last seen" at most every `session_touch_seconds`, so reads do not all become writes."""
    now = datetime.now(dt_timezone.utc)
    seen = session.get("last_seen_at")
    if seen:
        last = datetime.fromisoformat(seen)
        if last.tzinfo is None:
            last = last.replace(tzinfo=dt_timezone.utc)
        if (now - last).total_seconds() < config.session_touch_seconds():
            return
    crepo.touch_session(conn, session["id"], now.isoformat())


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
                      must_change_password=False, password_expires_at=None)
    crepo.delete_sessions_for_user(conn, user["id"])


def get_security_question(conn, email: str, secret: bytes) -> tuple[int, str]:
    """The question a "forgot password" form shows. An email with no usable account gets a stable
    decoy question, so this cannot be used to find out who has an account."""
    email = validate_email(email)
    user = crepo.get_user_by_email(conn, email)
    if user is not None and user["status"] == UserStatus.ACTIVE.value and user["security_question_id"] is not None:
        question_id = user["security_question_id"]
    else:
        question_id = captcha_math.decoy_question_id(email, secret, len(SECURITY_QUESTIONS))
    return question_id, SECURITY_QUESTIONS[question_id]


def reset_password(conn, *, email: str, security_answer: str, new_password: str) -> None:
    """Answer the security question to choose a new password. Wrong answers count towards the same
    lock as wrong passwords, because a security answer is far easier to guess than a password. The
    caller must commit when this raises ValidationError (the failed attempt must be remembered)."""
    user = crepo.get_user_by_email(conn, validate_email(email))
    usable = (user is not None and user["status"] == UserStatus.ACTIVE.value
              and user["security_answer_hash"] is not None)
    if not usable:
        _burn_password_check(security_answer)
        raise ValidationError("Invalid email or security answer.")
    _raise_if_locked(user)
    if not verify_security_answer(security_answer, user["security_answer_hash"]):
        _record_failed_attempt(conn, user)
        raise ValidationError("Invalid email or security answer.")
    validate_password(new_password)
    crepo.update_user(conn, user["id"], now=utc_now_iso(), password_hash=hash_password(new_password),
                      must_change_password=False, password_expires_at=None, failed_login_count=0,
                      locked_until=None)
    crepo.delete_sessions_for_user(conn, user["id"])


def update_profile(conn, user_id: int, *, name: str | None = None, timezone: str | None = None) -> dict:
    """Change the account's display name and (a copy of) its timezone. The ledger owns the timezone; the copy is for the admin screens."""
    changes: dict = {}
    if name is not None:
        changes["name"] = _clean_name(name)
    if timezone is not None:
        validate_timezone(timezone)
        changes["timezone"] = timezone
    return crepo.update_user(conn, user_id, now=utc_now_iso(), **changes)


# --- self-service: devices, security question, account deletion -------------------------------------


def _current_session_id(conn, token: str) -> int | None:
    session = crepo.get_session_by_token_hash(conn, hash_session_token(token)) if token else None
    return session["id"] if session is not None else None


def list_my_sessions(conn, user: dict, token: str) -> list[dict]:
    """Where this account is signed in, most recently used first; the caller's own session is marked."""
    current = _current_session_id(conn, token)
    now = datetime.now(dt_timezone.utc).isoformat()
    return [{**s, "current": s["id"] == current} for s in crepo.list_sessions_for_user(conn, user["id"], now)]


def revoke_my_session(conn, user: dict, session_id: int) -> None:
    if not crepo.delete_session_of_user(conn, user["id"], session_id):
        raise NotFoundError(f"Session {session_id} not found.")
    audit_service.record(conn, actor_user_id=user["id"], action="self.revoke_session",
                         target_user_id=user["id"], detail={"session_id": session_id})


def revoke_other_sessions(conn, user: dict, token: str) -> int:
    """Sign out every device except the one making the request; returns how many were ended."""
    current = _current_session_id(conn, token)
    now = datetime.now(dt_timezone.utc).isoformat()
    ended = 0
    for session in crepo.list_sessions_for_user(conn, user["id"], now):
        if session["id"] != current and crepo.delete_session_of_user(conn, user["id"], session["id"]):
            ended += 1
    audit_service.record(conn, actor_user_id=user["id"], action="self.revoke_other_sessions",
                         target_user_id=user["id"], detail={"ended": ended})
    return ended


def change_security_question(conn, user: dict, *, current_password: str, question_id: int, answer: str) -> None:
    """Replace the "forgot password" question and answer. Needs the current password."""
    if user["password_hash"] is None or not verify_password(current_password, user["password_hash"]):
        raise ValidationError("Current password is incorrect.")
    validate_security_question(question_id, answer)
    crepo.update_user(conn, user["id"], now=utc_now_iso(), security_question_id=question_id,
                      security_answer_hash=hash_security_answer(answer))
    audit_service.record(conn, actor_user_id=user["id"], action="self.change_security_question",
                         target_user_id=user["id"])


def delete_my_account(conn, user: dict, *, password: str, grace_days: int) -> dict:
    """Start deleting your own account: it is locked and every session ends, and it stays restorable
    by the superuser until the grace period is over. The superuser account cannot be deleted this way."""
    if user["role"] == PlatformRole.SUPERUSER.value:
        raise ConflictError("The superuser account cannot be deleted; transfer the role first.")
    if user["password_hash"] is None or not verify_password(password, user["password_hash"]):
        raise ValidationError("Password is incorrect.")
    after = (datetime.now(dt_timezone.utc) + timedelta(days=grace_days)).isoformat(timespec="seconds")
    updated = crepo.update_user(conn, user["id"], now=utc_now_iso(), status=UserStatus.PENDING_DELETE.value,
                                delete_after=after)
    crepo.delete_sessions_for_user(conn, user["id"])
    audit_service.record(conn, actor_user_id=user["id"], action="user.delete", target_user_id=user["id"],
                         detail={"delete_after": after, "self": True})
    return updated
