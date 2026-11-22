"""Ledger configuration and the friends (contacts) of one ledger. Each friend gets an auto-created DUE
account. Who may sign in, and under what name and email, is the control database's business
(identity_service); this ledger only keeps its own settings: timezone, home currency, ledger mode.
No layer here commits/rolls back the connection -- that's owned once, at the very end, by the API's
per-request dependency (presentation/api/deps.py::get_db)."""

from __future__ import annotations

from monetary.domain.credentials import validate_currency, validate_email
from monetary.domain.enums import AccountType, LedgerMode, as_enum
from monetary.domain.exceptions import ConflictError, NotFoundError, ValidationError
from monetary.domain.time_utils import utc_now_iso, validate_timezone
from monetary.infrastructure import repositories as repo

_validate_email = validate_email


def create_ledger_settings(conn, *, timezone: str | None, home_currency_code: str) -> dict:
    """Give a fresh ledger database its settings row and the system Equity account."""
    validate_timezone(timezone)
    currency = validate_currency(home_currency_code)
    now = utc_now_iso()
    settings = repo.create_settings(
        conn, timezone=timezone, home_currency_code=currency, ledger_mode=LedgerMode.DIRECT.value, now=now)
    # system Equity:Adjustments account, one-time, used automatically by the
    # "adjustment" transaction type
    repo.create_account(
        conn, name="Adjustments", account_type=AccountType.EQUITY.value, currency_code=None,
        is_system=True, now=now,
    )
    return settings


def require_settings(conn) -> dict:
    settings = repo.get_settings(conn)
    if settings is None:
        raise NotFoundError("This ledger has no settings yet; it was not set up.")
    return settings


def set_timezone(conn, tz_name: str | None) -> dict:
    require_settings(conn)
    validate_timezone(tz_name)
    return repo.update_settings(conn, now=utc_now_iso(), timezone=tz_name)


def set_ledger_mode(conn, mode: str) -> dict:
    require_settings(conn)
    resolved = as_enum(LedgerMode, mode)
    return repo.update_settings(conn, now=utc_now_iso(), ledger_mode=resolved.value)


def _ensure_email_free(conn, email: str, own_email: str) -> None:
    """A friend's email must not be the account holder's, nor another friend's.

    The account holder's email lives in the control database, which this ledger cannot see, so the
    caller must supply it (`own_email` has no default: forgetting it is an error, not a skipped check).
    This is a validation on a mutable value, not an invariant: changing the account email later is
    deliberately not checked against contacts."""
    if email == own_email.strip().lower() or repo.get_contact_by_email(conn, email) is not None:
        raise ConflictError(f"Email already in use: {email}")


def add_friend(conn, *, name: str, email: str, own_email: str, currency_code: str | None = None,
               phone: str | None = None) -> dict:
    """Create a friend and their DUE account. A friend cannot be the account holder (`own_email`)."""
    settings = require_settings(conn)
    if not name or not name.strip():
        raise ValidationError("Name is required.")
    email = _validate_email(email)
    _ensure_email_free(conn, email, own_email)

    now = utc_now_iso()
    friend = repo.create_contact(conn, name=name.strip(), email=email, phone=_clean_phone(phone), now=now)
    due_currency = (currency_code or settings["home_currency_code"]).strip().upper()
    repo.create_account(
        conn, name=f"Due: {friend['name']}", account_type=AccountType.DUE.value,
        currency_code=due_currency, counterparty_id=friend["id"], now=now,
    )
    return friend


def list_friends(conn) -> list[dict]:
    return repo.list_contacts(conn)


def get_friend_or_raise(conn, friend_id: int) -> dict:
    friend = repo.get_contact(conn, friend_id)
    if friend is None:
        raise NotFoundError(f"Friend {friend_id} not found.")
    return friend


def _clean_phone(phone: str | None) -> str | None:
    phone = (phone or "").strip()
    if len(phone) > 40:
        raise ValidationError("Phone must be at most 40 characters.")
    return phone or None


def update_friend(conn, user_id: int, *, fields: dict, own_email: str) -> dict:
    """Partial update of name / email / phone. `fields` holds only the keys the
    client sent: an explicit null phone clears it, an absent key is unchanged."""
    friend = get_friend_or_raise(conn, user_id)
    name, email, phone = friend["name"], friend["email"], friend["phone"]
    if "name" in fields:
        if not fields["name"] or not fields["name"].strip():
            raise ValidationError("New name is required.")
        name = fields["name"].strip()
    if "email" in fields:
        new_email = _validate_email(fields["email"])
        if new_email != friend["email"]:
            _ensure_email_free(conn, new_email, own_email)
            email = new_email
    if "phone" in fields:
        phone = _clean_phone(fields["phone"])
    now = utc_now_iso()
    updated = repo.update_contact_fields(conn, user_id, name=name, email=email, phone=phone, now=now)
    due_account = repo.get_due_account_for_friend(conn, user_id)
    if due_account is not None and name != friend["name"]:
        repo.rename_account(conn, due_account["id"], f"Due: {name}", now)
    return updated


def delete_friend(conn, user_id: int) -> None:
    friend = get_friend_or_raise(conn, user_id)
    due_account = repo.get_due_account_for_friend(conn, user_id)
    if due_account is not None:
        if repo.posting_count_for_account(conn, due_account["id"]) > 0:
            raise ConflictError(
                f"Friend {user_id} ({friend['name']}) has ledger postings against them and "
                "cannot be deleted. Rename them instead."
            )
        repo.hard_delete_account(conn, due_account["id"])
    repo.delete_contact(conn, user_id)
