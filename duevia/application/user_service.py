"""User application service: bootstrapping the single owner, managing friends
(each of whom gets an auto-created DUE account), and owner-only settings
(timezone, ledger_mode). No layer here commits/rolls back the connection --
that's owned once, at the very end, by presentation/cli.py::main()."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone

from duevia.domain.enums import AccountType, LedgerMode, as_enum
from duevia.domain.exceptions import ConflictError, NotFoundError, ValidationError
from duevia.domain.security import (
    MIN_PASSWORD_LENGTH,
    SECURITY_QUESTIONS,
    SESSION_TTL_HOURS,
    generate_session_token,
    hash_password,
    hash_security_answer,
    hash_session_token,
    verify_password,
    verify_security_answer,
)
from duevia.domain.time_utils import utc_now_iso, validate_timezone
from duevia.infrastructure import repositories as repo


def _validate_email(email: str) -> str:
    email = (email or "").strip()
    if not email or "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ValidationError(f"Invalid email: {email!r}")
    return email.lower()


def _validate_password(password: str) -> str:
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    return password


def _validate_security_question(question_id: int, answer: str) -> str:
    if question_id not in SECURITY_QUESTIONS:
        valid = ", ".join(str(k) for k in SECURITY_QUESTIONS)
        raise ValidationError(f"Invalid security_question_id {question_id!r}; must be one of: {valid}.")
    if not answer or not answer.strip():
        raise ValidationError("A security answer is required.")
    return answer


def bootstrap_owner(conn, *, name: str, email: str, timezone: str | None, home_currency_code: str,
                     password: str, security_question_id: int, security_answer: str) -> dict:
    if repo.get_superuser(conn) is not None:
        raise ConflictError("An owner already exists. Only one owner is allowed.")
    if not name or not name.strip():
        raise ValidationError("Name is required.")
    email = _validate_email(email)
    if repo.get_user_by_email(conn, email) is not None:
        raise ConflictError(f"Email already in use: {email}")
    validate_timezone(timezone)
    currency = (home_currency_code or "").strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise ValidationError(f"Invalid currency code {home_currency_code!r}; expected e.g. 'INR'.")
    _validate_password(password)
    _validate_security_question(security_question_id, security_answer)

    now = utc_now_iso()
    owner = repo.create_user(
        conn, name=name.strip(), email=email, is_superuser=True, timezone=timezone,
        home_currency_code=currency, ledger_mode=LedgerMode.DIRECT.value,
        password_hash=hash_password(password), security_question_id=security_question_id,
        security_answer_hash=hash_security_answer(security_answer), now=now,
    )
    # system Equity:Adjustments account, one-time, used automatically by `transaction adjustment`
    repo.create_account(
        conn, name="Adjustments", account_type=AccountType.EQUITY.value, currency_code=None,
        is_system=True, now=now,
    )
    return owner



def require_owner(conn) -> dict:
    owner = repo.get_superuser(conn)
    if owner is None:
        raise NotFoundError("No owner found. Run 'init' first to bootstrap the application owner.")
    return owner


def rename_owner(conn, new_name: str) -> dict:
    owner = require_owner(conn)
    if not new_name or not new_name.strip():
        raise ValidationError("New name is required.")
    return repo.rename_user(conn, owner["id"], new_name.strip(), utc_now_iso())


def set_owner_timezone(conn, tz_name: str | None) -> dict:
    owner = require_owner(conn)
    validate_timezone(tz_name)
    return repo.update_user_timezone(conn, owner["id"], tz_name, utc_now_iso())


def set_ledger_mode(conn, mode: str) -> dict:
    owner = require_owner(conn)
    resolved = as_enum(LedgerMode, mode)
    return repo.update_user_ledger_mode(conn, owner["id"], resolved.value, utc_now_iso())


def add_friend(conn, *, name: str, email: str, currency_code: str | None = None) -> dict:
    owner = require_owner(conn)
    if not name or not name.strip():
        raise ValidationError("Name is required.")
    email = _validate_email(email)
    if repo.get_user_by_email(conn, email) is not None:
        raise ConflictError(f"Email already in use: {email}")

    now = utc_now_iso()
    friend = repo.create_user(
        conn, name=name.strip(), email=email, is_superuser=False, timezone=None,
        home_currency_code=None, ledger_mode=LedgerMode.DIRECT.value, now=now,
    )
    due_currency = (currency_code or owner["home_currency_code"]).strip().upper()
    repo.create_account(
        conn, name=f"Due: {friend['name']}", account_type=AccountType.DUE.value,
        currency_code=due_currency, counterparty_user_id=friend["id"], now=now,
    )
    return friend


def list_friends(conn) -> list[dict]:
    return repo.list_users(conn, friends_only=True)


def get_user_or_raise(conn, user_id: int) -> dict:
    user = repo.get_user(conn, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} not found.")
    return user


def rename_friend(conn, user_id: int, new_name: str) -> dict:
    friend = get_user_or_raise(conn, user_id)
    if friend["is_superuser"]:
        raise ConflictError("Use 'owner rename' to rename the application owner.")
    if not new_name or not new_name.strip():
        raise ValidationError("New name is required.")
    now = utc_now_iso()
    updated = repo.rename_user(conn, user_id, new_name.strip(), now)
    due_account = repo.get_due_account_for_friend(conn, user_id)
    if due_account is not None:
        repo.rename_account(conn, due_account["id"], f"Due: {updated['name']}", now)
    return updated


def delete_friend(conn, user_id: int) -> None:
    friend = get_user_or_raise(conn, user_id)
    if friend["is_superuser"]:
        raise ConflictError("The owner cannot be deleted.")
    due_account = repo.get_due_account_for_friend(conn, user_id)
    if due_account is not None:
        if repo.posting_count_for_account(conn, due_account["id"]) > 0:
            raise ConflictError(
                f"Friend {user_id} ({friend['name']}) has ledger postings against them and "
                "cannot be deleted. Rename them instead."
            )
        repo.hard_delete_account(conn, due_account["id"])
    repo.delete_user(conn, user_id)


def _new_session(conn, owner_id: int) -> str:
    plaintext_token = generate_session_token()
    now_dt = datetime.now(dt_timezone.utc)
    expires_dt = now_dt + timedelta(hours=SESSION_TTL_HOURS)
    repo.create_session(
        conn, owner_id=owner_id, token_hash=hash_session_token(plaintext_token),
        created_at=now_dt.isoformat(), expires_at=expires_dt.isoformat(),
    )
    # opportunistic housekeeping -- cheap, and keeps the session table from
    # growing unbounded on a long-lived single-owner deployment
    repo.delete_expired_sessions(conn, now_dt.isoformat())
    return plaintext_token


def login(conn, *, email: str, password: str) -> tuple[dict, str]:
    """Returns (owner_row, plaintext_session_token). Deliberately raises the
    same error for 'no such email' and 'wrong password' -- distinguishing them
    would let a caller enumerate whether an email exists."""
    owner = repo.get_user_by_email(conn, _validate_email(email))
    if owner is None or not owner["is_superuser"] or owner["password_hash"] is None:
        raise ValidationError("Invalid email or password.")
    if not verify_password(password, owner["password_hash"]):
        raise ValidationError("Invalid email or password.")
    token = _new_session(conn, owner["id"])
    return owner, token


def logout(conn, plaintext_token: str) -> None:
    session = repo.get_session_by_token_hash(conn, hash_session_token(plaintext_token))
    if session is not None:
        repo.delete_session(conn, session["id"])


def verify_session(conn, plaintext_token: str) -> dict | None:
    """Returns the owner row if the session token is valid and not expired,
    else None -- used by the API's auth dependency. Deliberately returns None
    rather than raising, since 'no match' is a normal auth outcome, not a
    domain error."""
    if not plaintext_token:
        return None
    session = repo.get_session_by_token_hash(conn, hash_session_token(plaintext_token))
    if session is None:
        return None
    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=dt_timezone.utc)
    if expires_at < datetime.now(dt_timezone.utc):
        repo.delete_session(conn, session["id"])
        return None
    return repo.get_user(conn, session["owner_id"])


def change_password(conn, *, current_password: str, new_password: str) -> None:
    """Requires the current password even though the caller is already
    authenticated -- standard defense against a hijacked, still-valid session
    being used to lock the real owner out permanently. Invalidates every
    session (including the caller's own) so a changed password always forces
    a fresh login everywhere."""
    owner = require_owner(conn)
    if owner["password_hash"] is None or not verify_password(current_password, owner["password_hash"]):
        raise ValidationError("Current password is incorrect.")
    _validate_password(new_password)
    repo.update_user_password(conn, owner["id"], hash_password(new_password), utc_now_iso())
    repo.delete_all_sessions_for_owner(conn, owner["id"])


def get_security_question(conn, email: str) -> tuple[int, str]:
    owner = repo.get_user_by_email(conn, _validate_email(email))
    if owner is None or not owner["is_superuser"] or owner["security_question_id"] is None:
        raise NotFoundError("No account with that email has a security question set.")
    qid = owner["security_question_id"]
    return qid, SECURITY_QUESTIONS[qid]


def reset_password(conn, *, email: str, security_answer: str, new_password: str) -> None:
    owner = repo.get_user_by_email(conn, _validate_email(email))
    if owner is None or not owner["is_superuser"] or owner["security_answer_hash"] is None:
        raise ValidationError("Invalid email or security answer.")
    if not verify_security_answer(security_answer, owner["security_answer_hash"]):
        raise ValidationError("Invalid email or security answer.")
    _validate_password(new_password)
    repo.update_user_password(conn, owner["id"], hash_password(new_password), utc_now_iso())
    repo.delete_all_sessions_for_owner(conn, owner["id"])
