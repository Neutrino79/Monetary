"""Repository layer: pure data access, no business rules. This is the concrete
adapter side of the Ports & Adapters split — application services call these
functions without knowing they're backed by SQLite."""

from __future__ import annotations

import sqlite3
from typing import Any, Iterable, Optional


def _row(r: Optional[sqlite3.Row]) -> Optional[dict]:
    return dict(r) if r is not None else None


def _rows(rs: Iterable[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rs]


# --------------------------------------------------------------------------- #
# USER
# --------------------------------------------------------------------------- #

def create_user(conn, *, name, email, is_superuser, timezone, home_currency_code,
                 ledger_mode, password_hash=None, security_question_id=None,
                 security_answer_hash=None, phone=None, now) -> dict:
    cur = conn.execute(
        """INSERT INTO user (name, email, phone, is_superuser, timezone, home_currency_code,
                              ledger_mode, password_hash, security_question_id,
                              security_answer_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (name, email, phone, int(is_superuser), timezone, home_currency_code, ledger_mode,
         password_hash, security_question_id, security_answer_hash, now, now),
    )
    return get_user(conn, cur.lastrowid)


def update_user_password(conn, user_id, password_hash, now) -> dict:
    conn.execute("UPDATE user SET password_hash = ?, updated_at = ? WHERE id = ?",
                 (password_hash, now, user_id))
    return get_user(conn, user_id)


def get_user(conn, user_id) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM user WHERE id = ?", (user_id,)).fetchone())


def get_user_by_email(conn, email) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM user WHERE email = ?", (email,)).fetchone())


# --------------------------------------------------------------------------- #
# SESSION (login tokens)
# --------------------------------------------------------------------------- #

def create_session(conn, *, owner_id, token_hash, created_at, expires_at) -> dict:
    cur = conn.execute(
        "INSERT INTO session (owner_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (owner_id, token_hash, created_at, expires_at),
    )
    return _row(conn.execute("SELECT * FROM session WHERE id = ?", (cur.lastrowid,)).fetchone())


def get_session_by_token_hash(conn, token_hash) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM session WHERE token_hash = ?", (token_hash,)).fetchone())


def delete_session(conn, session_id) -> None:
    conn.execute("DELETE FROM session WHERE id = ?", (session_id,))


def delete_all_sessions_for_owner(conn, owner_id) -> None:
    conn.execute("DELETE FROM session WHERE owner_id = ?", (owner_id,))


def delete_expired_sessions(conn, now_iso) -> None:
    conn.execute("DELETE FROM session WHERE expires_at < ?", (now_iso,))


def get_superuser(conn) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM user WHERE is_superuser = 1").fetchone())


def list_users(conn, friends_only=False) -> list[dict]:
    if friends_only:
        return _rows(conn.execute("SELECT * FROM user WHERE is_superuser = 0 ORDER BY name").fetchall())
    return _rows(conn.execute("SELECT * FROM user ORDER BY is_superuser DESC, name").fetchall())


def rename_user(conn, user_id, new_name, now) -> dict:
    conn.execute("UPDATE user SET name = ?, updated_at = ? WHERE id = ?", (new_name, now, user_id))
    return get_user(conn, user_id)


def update_user_timezone(conn, user_id, tz, now) -> dict:
    conn.execute("UPDATE user SET timezone = ?, updated_at = ? WHERE id = ?", (tz, now, user_id))
    return get_user(conn, user_id)


def update_user_ledger_mode(conn, user_id, mode, now) -> dict:
    conn.execute("UPDATE user SET ledger_mode = ?, updated_at = ? WHERE id = ?", (mode, now, user_id))
    return get_user(conn, user_id)


def update_friend_fields(conn, user_id, *, name, email, phone, now) -> dict:
    """Full-value update of the editable friend columns (callers resolve
    'unchanged' vs 'cleared' before calling)."""
    conn.execute("UPDATE user SET name = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?",
                 (name, email, phone, now, user_id))
    return get_user(conn, user_id)


def delete_user(conn, user_id) -> None:
    conn.execute("DELETE FROM user WHERE id = ?", (user_id,))


# --------------------------------------------------------------------------- #
# ACCOUNT
# --------------------------------------------------------------------------- #

def create_account(conn, *, name, account_type, currency_code, parent_account_id=None,
                    budget_limit=None, counterparty_user_id=None, is_system=False,
                    subtype=None, credit_limit=None, statement_day=None, color=None, now) -> dict:
    cur = conn.execute(
        """INSERT INTO account (name, account_type, currency_code, parent_account_id,
                                 budget_limit, subtype, credit_limit, statement_day, color,
                                 counterparty_user_id, is_system, is_active,
                                 created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        (name, account_type, currency_code, parent_account_id, budget_limit, subtype,
         credit_limit, statement_day, color, counterparty_user_id, int(is_system), now, now),
    )
    return get_account(conn, cur.lastrowid)


def get_account(conn, account_id) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM account WHERE id = ?", (account_id,)).fetchone())


def get_due_account_for_friend(conn, friend_user_id) -> Optional[dict]:
    return _row(conn.execute(
        "SELECT * FROM account WHERE account_type = 'DUE' AND counterparty_user_id = ?",
        (friend_user_id,),
    ).fetchone())


def get_system_account(conn, account_type) -> Optional[dict]:
    return _row(conn.execute(
        "SELECT * FROM account WHERE account_type = ? AND is_system = 1", (account_type,)
    ).fetchone())


def list_accounts(conn, account_types=None, include_inactive=False) -> list[dict]:
    q = "SELECT * FROM account WHERE 1=1"
    params: list[Any] = []
    if account_types:
        placeholders = ",".join("?" for _ in account_types)
        q += f" AND account_type IN ({placeholders})"
        params.extend(account_types)
    if not include_inactive:
        q += " AND is_active = 1"
    q += " ORDER BY parent_account_id IS NULL DESC, id"
    return _rows(conn.execute(q, params).fetchall())


def rename_account(conn, account_id, new_name, now) -> dict:
    conn.execute("UPDATE account SET name = ?, updated_at = ? WHERE id = ?", (new_name, now, account_id))
    return get_account(conn, account_id)


def update_account_fields(conn, account_id, *, name, subtype, credit_limit, statement_day, color,
                          budget_limit, parent_account_id, now) -> dict:
    """Full-value update of the user-editable account/category columns."""
    conn.execute(
        "UPDATE account SET name = ?, subtype = ?, credit_limit = ?, statement_day = ?, color = ?, "
        "budget_limit = ?, parent_account_id = ?, updated_at = ? WHERE id = ?",
        (name, subtype, credit_limit, statement_day, color, budget_limit, parent_account_id, now, account_id),
    )
    return get_account(conn, account_id)


def reactivate_account(conn, account_id, now) -> dict:
    conn.execute("UPDATE account SET is_active = 1, updated_at = ? WHERE id = ?", (now, account_id))
    return get_account(conn, account_id)


def deactivate_account(conn, account_id, now) -> dict:
    conn.execute("UPDATE account SET is_active = 0, updated_at = ? WHERE id = ?", (now, account_id))
    return get_account(conn, account_id)


def child_account_ids(conn, parent_id) -> list[int]:
    rows = conn.execute("SELECT id FROM account WHERE parent_account_id = ?", (parent_id,)).fetchall()
    return [r["id"] for r in rows]


def has_active_children(conn, parent_id) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM account WHERE parent_account_id = ? AND is_active = 1",
        (parent_id,),
    ).fetchone()
    return row["c"] > 0


def account_name_exists(conn, account_type, name, exclude_id=None) -> bool:
    q = "SELECT id FROM account WHERE account_type = ? AND LOWER(name) = LOWER(?)"
    params: list[Any] = [account_type, name]
    if exclude_id is not None:
        q += " AND id != ?"
        params.append(exclude_id)
    return conn.execute(q, params).fetchone() is not None


def account_balance_points(conn, account_id, normal_side) -> int:
    """normal_side: 'DEBIT' or 'CREDIT' — which side increases this account."""
    row = conn.execute(
        "SELECT COALESCE(SUM(debit_amount),0) AS d, COALESCE(SUM(credit_amount),0) AS c "
        "FROM posting WHERE account_id = ?",
        (account_id,),
    ).fetchone()
    return (row["d"] - row["c"]) if normal_side == "DEBIT" else (row["c"] - row["d"])


def account_balance_points_as_of(conn, account_id, normal_side, as_of_iso) -> int:
    """Same as account_balance_points but only counting postings on entries
    dated strictly before as_of_iso -- used for historical trend charts."""
    row = conn.execute(
        """SELECT COALESCE(SUM(p.debit_amount),0) AS d, COALESCE(SUM(p.credit_amount),0) AS c
           FROM posting p JOIN journal_entry je ON je.id = p.journal_entry_id
           WHERE p.account_id = ? AND je.status = 'POSTED' AND je.entry_type != 'REVERSAL'
             AND je.entry_date < ?""",
        (account_id, as_of_iso),
    ).fetchone()
    return (row["d"] - row["c"]) if normal_side == "DEBIT" else (row["c"] - row["d"])


def total_debit_credit_for_account_type(conn, account_type, start_iso, end_iso) -> tuple[int, int]:
    """Sum of debit/credit across every account of the given type (EXPENSE or
    INCOME), within [start, end) -- used for the cashflow trend, which cares
    about total spend/earn, not any one category."""
    row = conn.execute(
        """SELECT COALESCE(SUM(p.debit_amount),0) AS d, COALESCE(SUM(p.credit_amount),0) AS c
           FROM posting p
           JOIN journal_entry je ON je.id = p.journal_entry_id
           JOIN account a ON a.id = p.account_id
           WHERE a.account_type = ? AND je.status = 'POSTED' AND je.entry_type != 'REVERSAL'
             AND je.entry_date >= ? AND je.entry_date < ?""",
        (account_type, start_iso, end_iso),
    ).fetchone()
    return row["d"], row["c"]


def expense_postings_in_range(conn, start_iso, end_iso) -> list[tuple[str, int]]:
    """(entry_date, net spend points) for every posting on an EXPENSE account within [start, end),
    POSTED entries only. Callers bucket these by the owner's local day."""
    rows = conn.execute(
        """SELECT je.entry_date AS entry_date, p.debit_amount - p.credit_amount AS points
           FROM posting p
           JOIN journal_entry je ON je.id = p.journal_entry_id
           JOIN account a ON a.id = p.account_id
           WHERE a.account_type = 'EXPENSE' AND je.status = 'POSTED' AND je.entry_type != 'REVERSAL'
             AND je.entry_date >= ? AND je.entry_date < ?""",
        (start_iso, end_iso),
    ).fetchall()
    return [(r["entry_date"], r["points"]) for r in rows]


def budgeted_root_accounts(conn) -> list[dict]:
    q = ("SELECT * FROM account WHERE account_type = 'EXPENSE' AND parent_account_id IS NULL "
         "AND budget_limit IS NOT NULL AND is_active = 1 ORDER BY id")
    return _rows(conn.execute(q).fetchall())


def account_period_debit_credit(conn, account_ids, start_iso, end_iso) -> tuple[int, int]:
    """Sum of debit/credit postings on the given accounts within [start, end), only
    counting postings on POSTED (non-reversed) entries."""
    if not account_ids:
        return 0, 0
    placeholders = ",".join("?" for _ in account_ids)
    row = conn.execute(
        f"""SELECT COALESCE(SUM(p.debit_amount),0) AS d, COALESCE(SUM(p.credit_amount),0) AS c
            FROM posting p
            JOIN journal_entry je ON je.id = p.journal_entry_id
            WHERE p.account_id IN ({placeholders})
              AND je.status = 'POSTED' AND je.entry_type != 'REVERSAL'
              AND je.entry_date >= ? AND je.entry_date < ?""",
        list(account_ids) + [start_iso, end_iso],
    ).fetchone()
    return row["d"], row["c"]


# --------------------------------------------------------------------------- #
# JOURNAL_ENTRY / POSTING / SPLIT_PARTICIPANT
# --------------------------------------------------------------------------- #

def create_journal_entry(conn, *, description, memo, entry_type, currency_code, entry_date,
                          status, reversal_of_id, refund_of_id, category_id, now,
                          correction_of_id=None) -> dict:
    cur = conn.execute(
        """INSERT INTO journal_entry (description, memo, entry_type, currency_code, entry_date,
                                       status, reversal_of_id, reversed_by_id, refund_of_id,
                                       category_id, correction_of_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)""",
        (description, memo, entry_type, currency_code, entry_date, status,
         reversal_of_id, refund_of_id, category_id, correction_of_id, now, now),
    )
    return get_journal_entry(conn, cur.lastrowid)


def get_journal_entry(conn, entry_id) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM journal_entry WHERE id = ?", (entry_id,)).fetchone())


def list_journal_entries(conn, *, account_id=None, category_id=None, entry_types=None,
                          include_reversed=False, date_from=None, date_to=None,
                          search=None, limit=None, offset=0) -> list[dict]:
    q = "SELECT DISTINCT je.* FROM journal_entry je"
    params: list[Any] = []
    joins = ""
    where = []
    if account_id is not None:
        joins = " JOIN posting p ON p.journal_entry_id = je.id"
        where.append("p.account_id = ?")
        params.append(account_id)
    if category_id is not None:
        where.append("je.category_id = ?")
        params.append(category_id)
    if entry_types:
        placeholders = ",".join("?" for _ in entry_types)
        where.append(f"je.entry_type IN ({placeholders})")
        params.extend(entry_types)
    if not include_reversed:
        # hide both halves of a reversed pair: the REVERSED original and its REVERSAL entry
        where.append("je.status = 'POSTED' AND je.entry_type != 'REVERSAL'")
    if date_from is not None:
        where.append("je.entry_date >= ?")
        params.append(date_from)
    if date_to is not None:
        where.append("je.entry_date < ?")
        params.append(date_to)
    if search:
        where.append("(je.description LIKE ? OR je.memo LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like])
    q += joins
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY je.entry_date DESC, je.id DESC"
    if limit is not None:
        q += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])
    return _rows(conn.execute(q, params).fetchall())


def count_journal_entries(conn, *, account_id=None, category_id=None, entry_types=None,
                           include_reversed=False, date_from=None, date_to=None, search=None) -> int:
    q = "SELECT COUNT(DISTINCT je.id) AS c FROM journal_entry je"
    params: list[Any] = []
    joins = ""
    where = []
    if account_id is not None:
        joins = " JOIN posting p ON p.journal_entry_id = je.id"
        where.append("p.account_id = ?")
        params.append(account_id)
    if category_id is not None:
        where.append("je.category_id = ?")
        params.append(category_id)
    if entry_types:
        placeholders = ",".join("?" for _ in entry_types)
        where.append(f"je.entry_type IN ({placeholders})")
        params.extend(entry_types)
    if not include_reversed:
        # hide both halves of a reversed pair: the REVERSED original and its REVERSAL entry
        where.append("je.status = 'POSTED' AND je.entry_type != 'REVERSAL'")
    if date_from is not None:
        where.append("je.entry_date >= ?")
        params.append(date_from)
    if date_to is not None:
        where.append("je.entry_date < ?")
        params.append(date_to)
    if search:
        where.append("(je.description LIKE ? OR je.memo LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like])
    q += joins
    if where:
        q += " WHERE " + " AND ".join(where)
    return conn.execute(q, params).fetchone()["c"]


def update_journal_entry_fields(conn, entry_id, *, description=None, memo=None,
                                 entry_date=None, category_id=None, category_id_set=False,
                                 entry_type=None, now) -> dict:
    """category_id_set=True means 'apply category_id even if it's None' (clearing
    it), vs the default 'None means unchanged', matching the other fields' convention
    for the common case but allowing an explicit clear when needed."""
    entry = get_journal_entry(conn, entry_id)
    new_category_id = category_id if (category_id is not None or category_id_set) else entry["category_id"]
    conn.execute(
        "UPDATE journal_entry SET description = ?, memo = ?, entry_date = ?, category_id = ?, "
        "entry_type = ?, updated_at = ? WHERE id = ?",
        (
            description if description is not None else entry["description"],
            memo if memo is not None else entry["memo"],
            entry_date if entry_date is not None else entry["entry_date"],
            new_category_id, entry_type or entry["entry_type"], now, entry_id,
        ),
    )
    return get_journal_entry(conn, entry_id)


def set_correction_of(conn, entry_id, original_id) -> None:
    conn.execute("UPDATE journal_entry SET correction_of_id = ? WHERE id = ?", (original_id, entry_id))


def mark_entry_reversed(conn, entry_id, reversed_by_id, now) -> dict:
    conn.execute(
        "UPDATE journal_entry SET status = 'REVERSED', reversed_by_id = ?, updated_at = ? WHERE id = ?",
        (reversed_by_id, now, entry_id),
    )
    return get_journal_entry(conn, entry_id)


def hard_delete_journal_entry(conn, entry_id) -> None:
    conn.execute("DELETE FROM posting WHERE journal_entry_id = ?", (entry_id,))
    conn.execute("DELETE FROM journal_entry WHERE id = ?", (entry_id,))


def create_posting(conn, *, journal_entry_id, account_id, debit_amount, credit_amount, now) -> dict:
    cur = conn.execute(
        """INSERT INTO posting (journal_entry_id, account_id, debit_amount, credit_amount,
                                 created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (journal_entry_id, account_id, debit_amount, credit_amount, now, now),
    )
    return _row(conn.execute("SELECT * FROM posting WHERE id = ?", (cur.lastrowid,)).fetchone())


def postings_for_entry(conn, entry_id) -> list[dict]:
    return _rows(conn.execute(
        "SELECT * FROM posting WHERE journal_entry_id = ? ORDER BY id", (entry_id,)
    ).fetchall())


def update_posting_amounts(conn, posting_id, debit_amount, credit_amount, now) -> dict:
    conn.execute(
        "UPDATE posting SET debit_amount = ?, credit_amount = ?, updated_at = ? WHERE id = ?",
        (debit_amount, credit_amount, now, posting_id),
    )
    return _row(conn.execute("SELECT * FROM posting WHERE id = ?", (posting_id,)).fetchone())


def delete_posting(conn, posting_id) -> None:
    conn.execute("DELETE FROM posting WHERE id = ?", (posting_id,))


def refunded_total_points(conn, original_entry_id) -> int:
    """Sum of the real-account (DEBIT) leg across every POSTED refund linked to
    this entry -- works whether the refund landed on an ASSET or a LIABILITY
    account, since either way the real-account leg of a refund is a DEBIT."""
    row = conn.execute(
        "SELECT COALESCE(SUM(p.debit_amount), 0) AS total "
        "FROM journal_entry je JOIN posting p ON p.journal_entry_id = je.id "
        "JOIN account a ON a.id = p.account_id "
        "WHERE je.refund_of_id = ? AND je.status = 'POSTED' "
        "AND a.account_type IN ('ASSET','LIABILITY')",
        (original_entry_id,),
    ).fetchone()
    return row["total"]


def posted_refund_count(conn, original_entry_id) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM journal_entry WHERE refund_of_id = ? AND status = 'POSTED'",
        (original_entry_id,),
    ).fetchone()
    return row["c"]


def posting_count_for_account(conn, account_id) -> int:
    row = conn.execute("SELECT COUNT(*) AS c FROM posting WHERE account_id = ?", (account_id,)).fetchone()
    return row["c"]


def hard_delete_account(conn, account_id) -> None:
    conn.execute("DELETE FROM account WHERE id = ?", (account_id,))


def friend_open_balance_accounts(conn) -> list[dict]:
    """Every friend's DUE account, joined with their name -- despite the name,
    this does NOT filter by balance (callers, e.g. statement_service.friend_balances,
    get every friend including ones currently settled at zero; the zero-balance
    row is meaningful to a UI, e.g. "Rahul: 0.00 (settled up)")."""
    return _rows(conn.execute(
        """SELECT a.*, u.name AS friend_name, u.email AS friend_email
           FROM account a JOIN user u ON u.id = a.counterparty_user_id
           WHERE a.account_type = 'DUE' ORDER BY a.id"""
    ).fetchall())


def posted_fronted_entries(conn) -> list[dict]:
    """Every POSTED friend-fronted entry with the amount credited to that friend's DUE account (what the
    friend paid on the owner's behalf), oldest first."""
    return _rows(conn.execute(
        """SELECT je.id, je.entry_date, je.category_id, p.account_id AS due_account_id,
                  a.counterparty_user_id AS friend_id, p.credit_amount AS amount
           FROM journal_entry je
           JOIN posting p ON p.journal_entry_id = je.id AND p.credit_amount > 0
           JOIN account a ON a.id = p.account_id AND a.account_type = 'DUE'
           WHERE je.entry_type = 'FRONTED' AND je.status = 'POSTED'
           ORDER BY je.entry_date, je.id"""
    ).fetchall())


def due_account_increase_entries(conn, due_account_id, increase_column: str) -> list[dict]:
    """Every POSTED entry that increased what's owed in one direction on this DUE
    account (increase_column = 'debit_amount' means 'friend owes more';
    'credit_amount' means 'owner owes more'), oldest first -- used only to build a
    human-readable FIFO best-effort label for a settlement, never for the math."""
    return _rows(conn.execute(
        f"""SELECT je.id, je.description, je.entry_date, p.{increase_column} AS amount
            FROM posting p JOIN journal_entry je ON je.id = p.journal_entry_id
            WHERE p.account_id = ? AND p.{increase_column} > 0 AND je.status = 'POSTED'
              AND je.entry_type != 'REVERSAL'
            ORDER BY je.entry_date, je.id""",
        (due_account_id,),
    ).fetchall())


def due_account_decrease_total(conn, due_account_id, decrease_column: str) -> int:
    row = conn.execute(
        f"""SELECT COALESCE(SUM(p.{decrease_column}), 0) AS total
            FROM posting p JOIN journal_entry je ON je.id = p.journal_entry_id
            WHERE p.account_id = ? AND je.status = 'POSTED' AND je.entry_type != 'REVERSAL'""",
        (due_account_id,),
    ).fetchone()
    return row["total"]


def all_root_categories(conn, account_type) -> list[dict]:
    q = ("SELECT * FROM account WHERE account_type = ? AND parent_account_id IS NULL "
         "AND is_active = 1 ORDER BY id")
    return _rows(conn.execute(q, (account_type,)).fetchall())


def last_activity_iso(conn, account_id) -> str | None:
    """The entry_date of the newest live (posted, not a reversal) entry that touches the account."""
    row = conn.execute(
        "SELECT MAX(je.entry_date) AS d FROM journal_entry je JOIN posting p ON p.journal_entry_id = je.id "
        "WHERE p.account_id = ? AND je.status = 'POSTED' AND je.entry_type != 'REVERSAL'", (account_id,),
    ).fetchone()
    return row["d"]
