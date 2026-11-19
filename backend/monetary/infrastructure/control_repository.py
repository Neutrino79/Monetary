"""Control-database data access: users, sessions, workspaces and the audit log. No business rules."""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

_USER_UPDATABLE = frozenset({
    "name", "password_hash", "security_question_id", "security_answer_hash", "role", "status",
    "status_reason", "must_change_password", "timezone", "home_currency_code", "plan", "access_until",
    "delete_after", "last_login_at", "approved_at", "approved_by", "failed_login_count", "locked_until",
    "password_expires_at", "rerequest_count",
})


def _row(r: Optional[sqlite3.Row]) -> Optional[dict]:
    return dict(r) if r is not None else None


# --------------------------------------------------------------------------- #
# USER
# --------------------------------------------------------------------------- #

def create_user(conn, *, email, name, password_hash, security_question_id=None, security_answer_hash=None,
                role, status, must_change_password=False, timezone=None, home_currency_code=None,
                approved_by=None, approved_at=None, now) -> dict:
    cur = conn.execute(
        """INSERT INTO user (email, name, password_hash, security_question_id, security_answer_hash, role,
                              status, must_change_password, timezone, home_currency_code, approved_by,
                              approved_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (email, name, password_hash, security_question_id, security_answer_hash, role, status,
         int(must_change_password), timezone, home_currency_code, approved_by, approved_at, now, now),
    )
    return get_user(conn, cur.lastrowid)


def get_user(conn, user_id) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM user WHERE id = ?", (user_id,)).fetchone())


def get_user_by_email(conn, email) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM user WHERE email = ?", (email,)).fetchone())


def update_user(conn, user_id, *, now, **fields) -> dict:
    """Update the given columns (only known ones) and bump updated_at."""
    unknown = set(fields) - _USER_UPDATABLE
    if unknown:
        raise ValueError(f"Cannot update user columns: {sorted(unknown)}")
    if "must_change_password" in fields:
        fields["must_change_password"] = int(fields["must_change_password"])
    columns = list(fields)
    assignments = ", ".join(f"{c} = ?" for c in columns)  # column names come from the whitelist above
    conn.execute(f"UPDATE user SET {assignments}, updated_at = ? WHERE id = ?",
                 [fields[c] for c in columns] + [now, user_id])
    return get_user(conn, user_id)


def _user_filter(status, q) -> tuple[str, list[Any]]:
    where, args = [], []
    if status:
        where.append("status = ?")
        args.append(status)
    if q:
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append("(email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')")
        args += [like, like]
    return (" WHERE " + " AND ".join(where)) if where else "", args


def list_users(conn, *, status=None, q=None, limit=50, offset=0) -> list[dict]:
    clause, args = _user_filter(status, q)
    rows = conn.execute(f"SELECT * FROM user{clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                        args + [limit, offset]).fetchall()
    return [dict(r) for r in rows]


def count_users(conn, *, status=None, q=None) -> int:
    clause, args = _user_filter(status, q)
    return conn.execute(f"SELECT COUNT(*) FROM user{clause}", args).fetchone()[0]


def count_users_by_status(conn) -> dict[str, int]:
    rows = conn.execute("SELECT status, COUNT(*) AS n FROM user GROUP BY status").fetchall()
    return {r["status"]: r["n"] for r in rows}


def count_superusers(conn) -> int:
    """Superusers of any status (there is meant to be exactly one)."""
    return conn.execute("SELECT COUNT(*) FROM user WHERE role = 'superuser'").fetchone()[0]


def count_active_admins(conn) -> int:
    return conn.execute("SELECT COUNT(*) FROM user WHERE role = 'admin' AND status = 'active'").fetchone()[0]


def list_superusers(conn) -> list[dict]:
    return [dict(r) for r in conn.execute("SELECT * FROM user WHERE role = 'superuser' ORDER BY id").fetchall()]


def count_active_superusers(conn) -> int:
    return conn.execute("SELECT COUNT(*) FROM user WHERE role = 'superuser' AND status = 'active'").fetchone()[0]


def delete_stale_requests(conn, *, pending_before: str, rejected_before: str) -> int:
    """Remove registration requests nobody approved in time and rejected ones past their retention.
    These accounts never had a ledger or a session, so nothing else refers to them."""
    cur = conn.execute(
        """DELETE FROM user WHERE (status = 'pending_approval' AND created_at < ?)
                              OR (status = 'rejected' AND updated_at < ?)""",
        (pending_before, rejected_before),
    )
    return cur.rowcount


# --------------------------------------------------------------------------- #
# SESSION
# --------------------------------------------------------------------------- #

def create_session(conn, *, user_id, token_hash, created_at, expires_at) -> dict:
    cur = conn.execute(
        "INSERT INTO session (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (user_id, token_hash, created_at, expires_at),
    )
    return _row(conn.execute("SELECT * FROM session WHERE id = ?", (cur.lastrowid,)).fetchone())


def get_session_by_token_hash(conn, token_hash) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM session WHERE token_hash = ?", (token_hash,)).fetchone())


def delete_session(conn, session_id) -> None:
    conn.execute("DELETE FROM session WHERE id = ?", (session_id,))


def delete_sessions_for_user(conn, user_id) -> None:
    conn.execute("DELETE FROM session WHERE user_id = ?", (user_id,))


def delete_expired_sessions(conn, now_iso) -> None:
    conn.execute("DELETE FROM session WHERE expires_at < ?", (now_iso,))


# --------------------------------------------------------------------------- #
# WORKSPACE / MEMBERSHIP
# --------------------------------------------------------------------------- #

def create_workspace(conn, *, public_id, db_path, schema_version, now) -> dict:
    cur = conn.execute(
        "INSERT INTO workspace (public_id, db_path, schema_version, created_at) VALUES (?, ?, ?, ?)",
        (public_id, db_path, schema_version, now),
    )
    return _row(conn.execute("SELECT * FROM workspace WHERE id = ?", (cur.lastrowid,)).fetchone())


def add_membership(conn, *, workspace_id, user_id, role="owner") -> None:
    conn.execute("INSERT INTO membership (workspace_id, user_id, role) VALUES (?, ?, ?)",
                 (workspace_id, user_id, role))


def get_workspace_for_user(conn, user_id) -> Optional[dict]:
    """The ledger this user owns (each user has at most one for now)."""
    return _row(conn.execute(
        """SELECT w.* FROM workspace w JOIN membership m ON m.workspace_id = w.id
           WHERE m.user_id = ? ORDER BY w.id LIMIT 1""", (user_id,)).fetchone())


# --------------------------------------------------------------------------- #
# AUDIT LOG (append-only)
# --------------------------------------------------------------------------- #

def add_audit(conn, *, at, actor_user_id, action, target_user_id=None, detail=None, ip=None) -> None:
    conn.execute(
        "INSERT INTO audit_log (at, actor_user_id, action, target_user_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)",
        (at, actor_user_id, action, target_user_id, detail, ip),
    )


def list_audit(conn, *, limit=50, offset=0, target_user_id=None) -> list[dict]:
    if target_user_id is None:
        rows = conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset))
    else:
        rows = conn.execute("SELECT * FROM audit_log WHERE target_user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
                            (target_user_id, limit, offset))
    return [dict(r) for r in rows.fetchall()]


def count_audit(conn, *, target_user_id=None) -> int:
    if target_user_id is None:
        return conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
    return conn.execute("SELECT COUNT(*) FROM audit_log WHERE target_user_id = ?", (target_user_id,)).fetchone()[0]


def begin_immediate(conn) -> None:
    """Take the write lock now (unless a transaction is already open), so a check followed by an
    insert cannot interleave with another process doing the same."""
    if not conn.in_transaction:
        conn.execute("BEGIN IMMEDIATE")


# --------------------------------------------------------------------------- #
# DELETION AND MAINTENANCE
# --------------------------------------------------------------------------- #

def list_due_for_deletion(conn, now: str) -> list[dict]:
    return [_row(r) for r in conn.execute(
        "SELECT * FROM user WHERE status = 'pending_delete' AND delete_after IS NOT NULL AND delete_after <= ? ORDER BY id",
        (now,)).fetchall()]


def delete_user(conn, user_id: int) -> None:
    """Remove the account row. Sessions and memberships go with it (ON DELETE CASCADE); audit rows
    stay, with their user references set to NULL."""
    conn.execute("DELETE FROM user WHERE id = ?", (user_id,))


def delete_workspace(conn, workspace_id: int) -> None:
    conn.execute("DELETE FROM workspace WHERE id = ?", (workspace_id,))


def list_workspaces(conn) -> list[dict]:
    return [_row(r) for r in conn.execute("SELECT * FROM workspace ORDER BY id").fetchall()]
