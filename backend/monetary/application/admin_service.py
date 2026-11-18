"""Platform administration: approving, creating, suspending and deleting accounts (superusers only).

Every function takes the *acting* superuser and writes one audit row. Nothing here can read a user's
ledger contents: only the control database is touched, plus provisioning an empty ledger.
Services never commit; the request (or CLI) owns the transaction.

Safety rules enforced here, not only in the UI:
- the last active superuser can never be demoted, suspended or deleted;
- nobody can suspend or delete themselves (demoting yourself is allowed only if another superuser stays);
- states move only along the lifecycle in docs/MULTI_TENANT.md.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone

from monetary.application import audit_service, operations, provisioning
from monetary.domain.credentials import validate_currency, validate_email
from monetary.domain.enums import PlatformRole, UserStatus
from monetary.domain.exceptions import ConflictError, NotFoundError, ValidationError
from monetary.domain.security import generate_temporary_password, hash_password
from monetary.domain.time_utils import utc_now_iso, validate_timezone
from monetary.infrastructure import control_repository as crepo

DELETE_GRACE_DAYS = 30
MAX_REASON_LENGTH = 300
_HIDDEN = ("password_hash", "security_answer_hash")


def public_user(user: dict) -> dict:
    """An account as the admin sees it: never any credential material."""
    return {k: v for k, v in user.items() if k not in _HIDDEN}


def _target(conn, user_id: int) -> dict:
    user = crepo.get_user(conn, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} not found.")
    return user


def _reason(reason: str | None) -> str | None:
    if reason is None or not reason.strip():
        return None
    reason = reason.strip()
    if len(reason) > MAX_REASON_LENGTH:
        raise ValidationError(f"Reason must be at most {MAX_REASON_LENGTH} characters.")
    return reason


def _expect_status(user: dict, *allowed: UserStatus, action: str) -> None:
    if user["status"] not in {s.value for s in allowed}:
        raise ConflictError(f"Cannot {action} an account that is {user['status']}.")


def _is_active_superuser(user: dict) -> bool:
    return user["role"] == PlatformRole.SUPERUSER.value and user["status"] == UserStatus.ACTIVE.value


def _protect_last_superuser(conn, user: dict, *, action: str) -> None:
    if _is_active_superuser(user) and crepo.count_active_superusers(conn) <= 1:
        raise ConflictError(f"Cannot {action} the last active superuser.")


def _not_self(actor: dict, user: dict, *, action: str) -> None:
    if actor["id"] == user["id"]:
        raise ConflictError(f"You cannot {action} your own account.")


def _audit(conn, actor: dict, action: str, user: dict, ip: str | None, **detail) -> None:
    audit_service.record(conn, actor_user_id=actor["id"], action=action, target_user_id=user["id"],
                         detail={k: v for k, v in detail.items() if v is not None} or None, ip=ip)


# -- reading --------------------------------------------------------------------------------------

def list_users(conn, *, status: str | None = None, q: str | None = None, limit: int = 50,
               offset: int = 0) -> tuple[list[dict], int]:
    if status is not None and status not in {s.value for s in UserStatus}:
        raise ValidationError(f"Unknown status: {status}")
    items = crepo.list_users(conn, status=status, q=q, limit=limit, offset=offset)
    return [public_user(u) for u in items], crepo.count_users(conn, status=status, q=q)


def get_user(conn, user_id: int) -> dict:
    return public_user(_target(conn, user_id))


def stats(conn, data_dir=None) -> dict:
    by_status = {s.value: 0 for s in UserStatus}
    by_status.update(crepo.count_users_by_status(conn))
    return {
        "total_users": sum(by_status.values()),
        "by_status": by_status,
        "pending_approval": by_status[UserStatus.PENDING_APPROVAL.value],
        "active_superusers": crepo.count_active_superusers(conn),
        **(operations.usage(conn, data_dir) if data_dir is not None else {"ledger_count": 0, "ledger_bytes": 0}),
    }


def audit_log(conn, *, limit: int = 50, offset: int = 0, target_user_id: int | None = None) -> tuple[list[dict], int]:
    return (crepo.list_audit(conn, limit=limit, offset=offset, target_user_id=target_user_id),
            crepo.count_audit(conn, target_user_id=target_user_id))


# -- changing accounts ----------------------------------------------------------------------------

def create_user(conn, data_dir, actor: dict, *, name: str, email: str, timezone: str | None,
                home_currency_code: str, role: str = PlatformRole.USER.value,
                ip: str | None = None) -> tuple[dict, str]:
    """Create an active account with a generated temporary password and an empty ledger.

    Returns `(account, temporary_password)`. The password is shown to the administrator once and is
    never stored in plain text or written to the audit log; the user must replace it at first login."""
    if role not in {r.value for r in PlatformRole}:
        raise ValidationError(f"Unknown role: {role}")
    name = (name or "").strip()
    if not name:
        raise ValidationError("Name is required.")
    email = validate_email(email)
    validate_timezone(timezone)
    currency = validate_currency(home_currency_code)
    if crepo.get_user_by_email(conn, email) is not None:
        raise ConflictError(f"Email already in use: {email}")
    temp = generate_temporary_password()
    now = utc_now_iso()
    user = crepo.create_user(
        conn, email=email, name=name, password_hash=hash_password(temp), role=role,
        status=UserStatus.ACTIVE.value, timezone=timezone, home_currency_code=currency,
        approved_at=now, now=now)
    user = crepo.update_user(conn, user["id"], now=now, must_change_password=True, approved_by=actor["id"])
    provisioning.provision_ledger(conn, data_dir, user["id"])
    _audit(conn, actor, "user.create", user, ip, email=email, role=role)
    return public_user(user), temp


def approve(conn, data_dir, actor: dict, user_id: int, *, ip: str | None = None) -> dict:
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.PENDING_APPROVAL, action="approve")
    now = utc_now_iso()
    user = crepo.update_user(conn, user_id, now=now, status=UserStatus.ACTIVE.value, status_reason=None,
                             approved_at=now, approved_by=actor["id"])
    provisioning.provision_ledger(conn, data_dir, user_id)
    _audit(conn, actor, "user.approve", user, ip)
    return public_user(user)


def reject(conn, actor: dict, user_id: int, *, reason: str | None = None, ip: str | None = None) -> dict:
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.PENDING_APPROVAL, action="reject")
    reason = _reason(reason)
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=UserStatus.REJECTED.value,
                             status_reason=reason)
    _audit(conn, actor, "user.reject", user, ip, reason=reason)
    return public_user(user)


def suspend(conn, actor: dict, user_id: int, *, reason: str | None = None, ip: str | None = None) -> dict:
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.ACTIVE, action="suspend")
    _not_self(actor, user, action="suspend")
    _protect_last_superuser(conn, user, action="suspend")
    reason = _reason(reason)
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=UserStatus.SUSPENDED.value,
                             status_reason=reason)
    crepo.delete_sessions_for_user(conn, user_id)
    _audit(conn, actor, "user.suspend", user, ip, reason=reason)
    return public_user(user)


def reactivate(conn, actor: dict, user_id: int, *, ip: str | None = None) -> dict:
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.SUSPENDED, action="reactivate")
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=UserStatus.ACTIVE.value,
                             status_reason=None)
    _audit(conn, actor, "user.reactivate", user, ip)
    return public_user(user)


def reset_password(conn, actor: dict, user_id: int, *, ip: str | None = None) -> tuple[dict, str]:
    """Give an account a new temporary password and sign it out everywhere. Returns it once."""
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.ACTIVE, UserStatus.SUSPENDED, action="reset the password of")
    temp = generate_temporary_password()
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), password_hash=hash_password(temp),
                             must_change_password=True)
    crepo.delete_sessions_for_user(conn, user_id)
    _audit(conn, actor, "user.reset_password", user, ip)
    return public_user(user), temp


def revoke_sessions(conn, actor: dict, user_id: int, *, ip: str | None = None) -> None:
    user = _target(conn, user_id)
    crepo.delete_sessions_for_user(conn, user_id)
    _audit(conn, actor, "user.revoke_sessions", user, ip)


def delete(conn, actor: dict, user_id: int, *, ip: str | None = None) -> dict:
    """Start deletion: the account is locked and its data is purged after DELETE_GRACE_DAYS.
    `restore` undoes it within that time."""
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.REJECTED,
                   UserStatus.PENDING_APPROVAL, action="delete")
    _not_self(actor, user, action="delete")
    _protect_last_superuser(conn, user, action="delete")
    now = datetime.now(dt_timezone.utc)
    after = (now + timedelta(days=DELETE_GRACE_DAYS)).isoformat(timespec="seconds")
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=UserStatus.PENDING_DELETE.value,
                             delete_after=after)
    crepo.delete_sessions_for_user(conn, user_id)
    _audit(conn, actor, "user.delete", user, ip, delete_after=after)
    return public_user(user)


def restore(conn, actor: dict, user_id: int, *, ip: str | None = None) -> dict:
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.PENDING_DELETE, action="restore")
    has_ledger = crepo.get_workspace_for_user(conn, user_id) is not None
    # An account that never got a ledger (deleted while still pending) goes back to waiting.
    target = UserStatus.ACTIVE if has_ledger else UserStatus.PENDING_APPROVAL
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=target.value, delete_after=None)
    _audit(conn, actor, "user.restore", user, ip)
    return public_user(user)


def set_role(conn, actor: dict, user_id: int, role: str, *, ip: str | None = None) -> dict:
    if role not in {r.value for r in PlatformRole}:
        raise ValidationError(f"Unknown role: {role}")
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.ACTIVE, action="change the role of")
    if user["role"] == role:
        return public_user(user)
    if role != PlatformRole.SUPERUSER.value:
        _protect_last_superuser(conn, user, action="demote")
    before = user["role"]
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), role=role)
    crepo.delete_sessions_for_user(conn, user_id)  # a new role means a fresh sign-in (and session length)
    _audit(conn, actor, "user.set_role", user, ip, before=before, after=role)
    return public_user(user)
