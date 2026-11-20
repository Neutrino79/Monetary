"""Platform administration: approving, creating, suspending and deleting accounts.

Three roles: the single superuser (the owner), admins (who help manage ordinary accounts) and users.
Every function takes the *acting* account and writes one audit row. Nothing here can read a user's
ledger contents: only the control database is touched, plus provisioning an empty ledger.
Services never commit; the request (or CLI) owns the transaction.

Safety rules enforced here, not only in the UI:
- an account may only act on accounts of a strictly lower role (admins cannot touch admins or the superuser);
- creating or deleting accounts' data and changing roles is for the superuser; admins can create ordinary
  users, approve, reject, suspend, unlock and reset passwords of ordinary users;
- there is exactly one superuser: nobody can be promoted to it (see `identity_service.transfer_superuser`);
- the last active superuser can never be demoted, suspended or deleted;
- nobody can suspend or delete themselves (demoting yourself is allowed only if another superuser stays);
- states move only along the lifecycle in docs/MULTI_TENANT.md.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone

from monetary import config
from monetary.application import audit_service, operations, provisioning
from monetary.domain.credentials import validate_currency, validate_email
from monetary.domain.enums import PlatformRole, UserStatus, role_rank
from monetary.domain.exceptions import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
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


def _temp_password_expiry() -> str:
    return (datetime.now(dt_timezone.utc) + timedelta(hours=config.temp_password_hours())).isoformat(
        timespec="seconds")


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


def _actor_rank(actor: dict) -> int:
    return role_rank(actor.get("role", PlatformRole.USER.value))  # a missing role is the lowest, never the highest


def _require_superuser(actor: dict, *, action: str) -> None:
    if _actor_rank(actor) < role_rank(PlatformRole.SUPERUSER.value):
        raise PermissionDeniedError(f"Only the superuser can {action}.")


def _authorize(actor: dict, user: dict, *, action: str, allow_self: bool = False) -> None:
    """The acting account must outrank the account it acts on. (Ending your own sessions is the one
    thing you may do to yourself.)"""
    if actor["id"] == user["id"]:
        if allow_self:
            return
        raise ConflictError(f"You cannot {action} your own account.")
    if _actor_rank(actor) <= role_rank(user["role"]):
        raise PermissionDeniedError(f"You cannot {action} an account with the same or a higher role than yours.")


def _audit(conn, actor: dict, action: str, user: dict, ip: str | None, **detail) -> None:
    detail["actor_role"] = actor.get("role")
    audit_service.record(conn, actor_user_id=actor["id"], action=action, target_user_id=user["id"],
                         detail={k: v for k, v in detail.items() if v is not None} or None, ip=ip)


# -- reading --------------------------------------------------------------------------------------

def _with_usage(conn, data_dir, users: list[dict]) -> list[dict]:
    """Add each account's last activity and ledger size (the size only when a data directory is given)."""
    ids = [u["id"] for u in users]
    seen = crepo.last_activity_by_user(conn, ids)
    spaces = crepo.workspaces_by_user(conn, ids) if data_dir is not None else {}
    out = []
    for u in users:
        row = public_user(u)
        row["last_activity_at"] = seen.get(u["id"]) or u.get("last_login_at")
        space = spaces.get(u["id"])
        row["storage_bytes"] = operations.ledger_bytes(data_dir, space) if space else None
        out.append(row)
    return out


def list_users(conn, *, status: str | None = None, q: str | None = None, limit: int = 50,
               offset: int = 0, data_dir=None) -> tuple[list[dict], int]:
    if status is not None and status not in {s.value for s in UserStatus}:
        raise ValidationError(f"Unknown status: {status}")
    items = crepo.list_users(conn, status=status, q=q, limit=limit, offset=offset)
    return _with_usage(conn, data_dir, items), crepo.count_users(conn, status=status, q=q)


def get_user(conn, user_id: int, data_dir=None) -> dict:
    return _with_usage(conn, data_dir, [_target(conn, user_id)])[0]


def sessions(conn, user_id: int) -> list[dict]:
    """The account's live sign-ins (never the tokens)."""
    _target(conn, user_id)
    return crepo.list_sessions_for_user(conn, user_id, utc_now_iso())


def stats(conn, data_dir=None) -> dict:
    by_status = {s.value: 0 for s in UserStatus}
    by_status.update(crepo.count_users_by_status(conn))
    return {
        "total_users": sum(by_status.values()),
        "by_status": by_status,
        "pending_approval": by_status[UserStatus.PENDING_APPROVAL.value],
        "active_superusers": crepo.count_active_superusers(conn),
        "active_admins": crepo.count_active_admins(conn),
        "overdue_for_purge": crepo.count_due_for_deletion(conn, utc_now_iso()),
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
    if role == PlatformRole.SUPERUSER.value:
        raise ConflictError("There is only one superuser; it cannot be created here.")
    if role != PlatformRole.USER.value:
        _require_superuser(actor, action="create an admin")
    elif _actor_rank(actor) < role_rank(PlatformRole.ADMIN.value):
        raise PermissionDeniedError("Only an admin or the superuser can create accounts.")
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
    user = crepo.update_user(conn, user["id"], now=now, must_change_password=True, approved_by=actor["id"],
                             password_expires_at=_temp_password_expiry())
    provisioning.provision_ledger(conn, data_dir, user["id"])
    _audit(conn, actor, "user.create", user, ip, email=email, role=role)
    return public_user(user), temp


def approve(conn, data_dir, actor: dict, user_id: int, *, ip: str | None = None) -> dict:
    user = _target(conn, user_id)
    _authorize(actor, user, action="approve")
    _expect_status(user, UserStatus.PENDING_APPROVAL, action="approve")
    now = utc_now_iso()
    user = crepo.update_user(conn, user_id, now=now, status=UserStatus.ACTIVE.value, status_reason=None,
                             approved_at=now, approved_by=actor["id"])
    provisioning.provision_ledger(conn, data_dir, user_id)
    _audit(conn, actor, "user.approve", user, ip)
    return public_user(user)


def reject(conn, actor: dict, user_id: int, *, reason: str | None = None, ip: str | None = None) -> dict:
    user = _target(conn, user_id)
    _authorize(actor, user, action="reject")
    _expect_status(user, UserStatus.PENDING_APPROVAL, action="reject")
    reason = _reason(reason)
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=UserStatus.REJECTED.value,
                             status_reason=reason)
    _audit(conn, actor, "user.reject", user, ip, reason=reason)
    return public_user(user)


def suspend(conn, actor: dict, user_id: int, *, reason: str | None = None, ip: str | None = None) -> dict:
    user = _target(conn, user_id)
    _authorize(actor, user, action="suspend")
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
    _authorize(actor, user, action="reactivate")
    _expect_status(user, UserStatus.SUSPENDED, action="reactivate")
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=UserStatus.ACTIVE.value,
                             status_reason=None)
    _audit(conn, actor, "user.reactivate", user, ip)
    return public_user(user)


def reset_password(conn, actor: dict, user_id: int, *, ip: str | None = None) -> tuple[dict, str]:
    """Give an account a new temporary password and sign it out everywhere. Returns it once."""
    user = _target(conn, user_id)
    _authorize(actor, user, action="reset the password of")
    _expect_status(user, UserStatus.ACTIVE, UserStatus.SUSPENDED, action="reset the password of")
    temp = generate_temporary_password()
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), password_hash=hash_password(temp),
                             must_change_password=True, password_expires_at=_temp_password_expiry(),
                             failed_login_count=0, locked_until=None)
    crepo.delete_sessions_for_user(conn, user_id)
    _audit(conn, actor, "user.reset_password", user, ip)
    return public_user(user), temp


def unlock(conn, actor: dict, user_id: int, *, ip: str | None = None) -> dict:
    """Lift a sign-in lock now instead of waiting for it to run out."""
    user = _target(conn, user_id)
    _authorize(actor, user, action="unlock")
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), failed_login_count=0, locked_until=None)
    _audit(conn, actor, "user.unlock", user, ip)
    return public_user(user)


def reopen(conn, actor: dict, user_id: int, *, ip: str | None = None) -> dict:
    """Put a rejected request back in the queue, with a fresh allowance of re-requests."""
    user = _target(conn, user_id)
    _authorize(actor, user, action="reopen")
    _expect_status(user, UserStatus.REJECTED, action="reopen")
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=UserStatus.PENDING_APPROVAL.value,
                             status_reason=None, rerequest_count=0)
    _audit(conn, actor, "user.reopen", user, ip)
    return public_user(user)


def revoke_sessions(conn, actor: dict, user_id: int, *, ip: str | None = None) -> None:
    user = _target(conn, user_id)
    _authorize(actor, user, action="sign out", allow_self=True)
    crepo.delete_sessions_for_user(conn, user_id)
    _audit(conn, actor, "user.revoke_sessions", user, ip)


def revoke_session(conn, actor: dict, user_id: int, session_id: int, *, ip: str | None = None) -> None:
    user = _target(conn, user_id)
    _authorize(actor, user, action="sign out", allow_self=True)
    if not crepo.delete_session_of_user(conn, user_id, session_id):
        raise NotFoundError(f"Session {session_id} not found.")
    _audit(conn, actor, "user.revoke_session", user, ip, session_id=session_id)


def update_profile(conn, actor: dict, user_id: int, *, name: str | None = None, email: str | None = None,
                   timezone: str | None = None, ip: str | None = None) -> dict:
    """Correct an account's name, email or time zone. Changing the email signs the person out, since the
    email is what they sign in with. The time zone can be set only before the account has a ledger (a
    pending request); afterwards the ledger owns it and only the account holder changes it."""
    user = _target(conn, user_id)
    _authorize(actor, user, action="edit")
    _expect_status(user, UserStatus.PENDING_APPROVAL, UserStatus.ACTIVE, UserStatus.REJECTED,
                   UserStatus.SUSPENDED, action="edit")
    fields: dict = {}
    if name is not None:
        name = name.strip()
        if not name:
            raise ValidationError("Name is required.")
        if len(name) > 100:
            raise ValidationError("Name must be at most 100 characters.")
        if name != user["name"]:
            fields["name"] = name
    if email is not None:
        email = validate_email(email)
        if email != user["email"]:
            if crepo.get_user_by_email(conn, email) is not None:
                raise ConflictError(f"Email already in use: {email}")
            fields["email"] = email
    if timezone is not None:
        validate_timezone(timezone)
        if timezone != user["timezone"]:
            if crepo.get_workspace_for_user(conn, user_id) is not None:
                raise ConflictError("Time zone belongs to the ledger once it exists; the account holder "
                                    "changes it in Settings.")
            fields["timezone"] = timezone
    if not fields:
        return public_user(user)
    updated = crepo.update_user(conn, user_id, now=utc_now_iso(), **fields)
    if "email" in fields:
        crepo.delete_sessions_for_user(conn, user_id)
    _audit(conn, actor, "user.edit", updated, ip, changed=",".join(sorted(fields)),
           old_email=user["email"] if "email" in fields else None,
           new_email=fields.get("email"))
    return public_user(updated)


BULK_ACTIONS = ("approve", "reject", "suspend", "reactivate")


def bulk(conn, data_dir, actor: dict, action: str, user_ids: list[int], *, reason: str | None = None,
         ip: str | None = None) -> list[dict]:
    """Apply one of approve / reject / suspend / reactivate to several accounts. Each account stands on
    its own: one that is refused (wrong state, higher role) is reported and the rest still go through.
    Deleting is deliberately not available in bulk."""
    if action not in BULK_ACTIONS:
        raise ValidationError(f"Unknown bulk action: {action}. Use one of {', '.join(BULK_ACTIONS)}.")
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        raise ValidationError("Choose at least one account.")
    limit = config.bulk_action_limit()
    if len(ids) > limit:
        raise ValidationError(f"At most {limit} accounts at a time.")
    results = []
    if not conn.in_transaction:  # a savepoint released outside a transaction would commit
        conn.execute("BEGIN")
    for uid in ids:
        conn.execute("SAVEPOINT bulk_item")
        try:
            if action == "approve":
                approve(conn, data_dir, actor, uid, ip=ip)
            elif action == "reject":
                reject(conn, actor, uid, reason=reason, ip=ip)
            elif action == "suspend":
                suspend(conn, actor, uid, reason=reason, ip=ip)
            else:
                reactivate(conn, actor, uid, ip=ip)
        except (ConflictError, NotFoundError, PermissionDeniedError, ValidationError) as exc:
            conn.execute("ROLLBACK TO bulk_item")
            conn.execute("RELEASE bulk_item")
            results.append({"user_id": uid, "ok": False, "error": str(exc)})
        else:
            conn.execute("RELEASE bulk_item")
            results.append({"user_id": uid, "ok": True, "error": None})
    return results


def purge_now(conn, data_dir, actor: dict, *, ip: str | None = None) -> operations.PurgeResult:
    """Finish every deletion whose grace period is over (superuser only). The caller commits and then
    removes `result.files_to_delete`; the accounts are forgotten before their files go."""
    _require_superuser(actor, action="purge accounts")
    result = operations.purge_due_accounts(conn, data_dir)
    audit_service.record(conn, actor_user_id=actor["id"], action="admin.purge", target_user_id=None,
                         detail={"accounts": len(result.purged_emails)}, ip=ip)
    return result


def delete(conn, actor: dict, user_id: int, *, ip: str | None = None) -> dict:
    """Start deletion: the account is locked and its data is purged after DELETE_GRACE_DAYS.
    `restore` undoes it within that time."""
    _require_superuser(actor, action="delete accounts")
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
    _require_superuser(actor, action="restore accounts")
    user = _target(conn, user_id)
    _expect_status(user, UserStatus.PENDING_DELETE, action="restore")
    has_ledger = crepo.get_workspace_for_user(conn, user_id) is not None
    # An account that never got a ledger (deleted while still pending) goes back to waiting.
    target = UserStatus.ACTIVE if has_ledger else UserStatus.PENDING_APPROVAL
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), status=target.value, delete_after=None)
    _audit(conn, actor, "user.restore", user, ip)
    return public_user(user)


def set_role(conn, actor: dict, user_id: int, role: str, *, ip: str | None = None) -> dict:
    """Make an account an admin or an ordinary user (superuser only). The superuser role itself cannot
    be given or taken here: there is exactly one, moved only with `identity_service.transfer_superuser`."""
    _require_superuser(actor, action="change roles")
    if role not in {r.value for r in PlatformRole}:
        raise ValidationError(f"Unknown role: {role}")
    if role == PlatformRole.SUPERUSER.value:
        raise ConflictError("There is only one superuser; the role can be handed over only from the "
                            "command line (transfer-superuser).")
    user = _target(conn, user_id)
    if user["role"] == PlatformRole.SUPERUSER.value:
        raise ConflictError("The superuser's role cannot be changed here; use transfer-superuser.")
    _expect_status(user, UserStatus.ACTIVE, action="change the role of")
    if user["role"] == role:
        return public_user(user)
    before = user["role"]
    user = crepo.update_user(conn, user_id, now=utc_now_iso(), role=role)
    crepo.delete_sessions_for_user(conn, user_id)  # a new role means a fresh sign-in (and session length)
    _audit(conn, actor, "user.set_role", user, ip, before=before, after=role)
    return public_user(user)
