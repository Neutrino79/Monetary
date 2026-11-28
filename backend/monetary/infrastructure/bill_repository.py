"""SQL for bills (a split or friend-paid entry, seen from one friend), the settlements tied to them and the
matches between a bill the friend owes you and a bill you owe the friend.

Nothing here stores "paid" or "remaining": both are summed from the settlement entries linked to a bill
(`journal_entry.settles_entry_id`) and from `bill_match`, so they cannot drift from the ledger.
"""

from __future__ import annotations

from typing import Any, Optional

from monetary.infrastructure.repositories import _row, _rows

_BILL_SELECT = """
SELECT je.id, je.entry_type, je.description, je.entry_date, je.category_id, je.currency_code,
       p.account_id AS due_account_id, a.counterparty_id AS friend_id,
       CASE WHEN je.entry_type = 'SPLIT' THEN p.debit_amount ELSE p.credit_amount END AS amount,
       COALESCE((SELECT SUM(sp.debit_amount + sp.credit_amount)
                   FROM journal_entry s JOIN posting sp ON sp.journal_entry_id = s.id AND sp.account_id = p.account_id
                  WHERE s.settles_entry_id = je.id AND s.entry_type = 'SETTLEMENT' AND s.status = 'POSTED'), 0) AS paid,
       COALESCE((SELECT SUM(m.amount) FROM bill_match m
                  WHERE m.friend_due_account_id = p.account_id
                    AND (m.owed_to_me_entry_id = je.id OR m.owed_by_me_entry_id = je.id)), 0) AS matched
  FROM journal_entry je JOIN posting p ON p.journal_entry_id = je.id
  JOIN account a ON a.id = p.account_id AND a.account_type = 'DUE'
 WHERE je.entry_type IN ('SPLIT', 'FRONTED') AND je.status = 'POSTED'
   AND ((je.entry_type = 'SPLIT' AND p.debit_amount > 0) OR (je.entry_type = 'FRONTED' AND p.credit_amount > 0))
"""


def friend_bills(conn, due_account_id) -> list[dict]:
    """Every posted split / friend-paid entry that involves this friend, oldest first. `amount` is the friend's
    share (SPLIT: what they owe you; FRONTED: what you owe them)."""
    return _rows(conn.execute(
        _BILL_SELECT + " AND p.account_id = ? ORDER BY je.entry_date, je.id", (due_account_id,)).fetchall())


def get_bill(conn, entry_id, due_account_id) -> Optional[dict]:
    return _row(conn.execute(
        _BILL_SELECT + " AND je.id = ? AND p.account_id = ?", (entry_id, due_account_id)).fetchone())


def bills_for_entries(conn, entry_ids) -> dict[int, list[dict]]:
    """The bill rows (one per friend) of the given entries, keyed by entry id."""
    if not entry_ids:
        return {}
    marks = ",".join("?" for _ in entry_ids)
    out: dict[int, list[dict]] = {}
    for row in _rows(conn.execute(
            _BILL_SELECT + f" AND je.id IN ({marks}) ORDER BY je.id, p.id", list(entry_ids)).fetchall()):
        out.setdefault(row["id"], []).append(row)
    return out


def bill_friends(conn, entry_id) -> list[int]:
    """The DUE account ids of every friend on a split / friend-paid entry."""
    rows = conn.execute(
        """SELECT p.account_id FROM posting p JOIN account a ON a.id = p.account_id
            WHERE p.journal_entry_id = ? AND a.account_type = 'DUE' ORDER BY p.id""", (entry_id,)).fetchall()
    return [r["account_id"] for r in rows]


def payments_for_bill(conn, entry_id, due_account_id=None) -> list[dict]:
    """The posted settlements tied to a bill (for one friend, or all of them), oldest first."""
    q = """SELECT s.id, s.description, s.entry_date, s.payment_group, s.settles_entry_id,
                  sp.account_id AS due_account_id, (sp.debit_amount + sp.credit_amount) AS amount
             FROM journal_entry s JOIN posting sp ON sp.journal_entry_id = s.id
             JOIN account a ON a.id = sp.account_id AND a.account_type = 'DUE'
            WHERE s.settles_entry_id = ? AND s.entry_type = 'SETTLEMENT' AND s.status = 'POSTED'"""
    params: list[Any] = [entry_id]
    if due_account_id is not None:
        q += " AND sp.account_id = ?"
        params.append(due_account_id)
    return _rows(conn.execute(q + " ORDER BY s.entry_date, s.id", params).fetchall())


def unassigned_payments(conn, due_account_id=None) -> list[dict]:
    """Posted settlements that are not tied to any bill (recorded before bills were settled one by one)."""
    q = """SELECT s.id, s.description, s.entry_date, sp.account_id AS due_account_id,
                  (sp.debit_amount + sp.credit_amount) AS amount,
                  CASE WHEN sp.credit_amount > 0 THEN 'receive' ELSE 'pay' END AS direction
             FROM journal_entry s JOIN posting sp ON sp.journal_entry_id = s.id
             JOIN account a ON a.id = sp.account_id AND a.account_type = 'DUE'
            WHERE s.entry_type = 'SETTLEMENT' AND s.status = 'POSTED' AND s.settles_entry_id IS NULL"""
    params: list[Any] = []
    if due_account_id is not None:
        q += " AND sp.account_id = ?"
        params.append(due_account_id)
    return _rows(conn.execute(q + " ORDER BY s.entry_date, s.id", params).fetchall())


def set_settlement_link(conn, entry_id, settles_entry_id, payment_group) -> None:
    conn.execute("UPDATE journal_entry SET settles_entry_id = ?, payment_group = ? WHERE id = ?",
                 (settles_entry_id, payment_group, entry_id))


def repoint_bill(conn, old_id, new_id) -> None:
    """A corrected bill gets a new entry id in STRICT mode: payments and matches follow it."""
    conn.execute("UPDATE journal_entry SET settles_entry_id = ? WHERE settles_entry_id = ?", (new_id, old_id))
    conn.execute("UPDATE bill_match SET owed_to_me_entry_id = ? WHERE owed_to_me_entry_id = ?", (new_id, old_id))
    conn.execute("UPDATE bill_match SET owed_by_me_entry_id = ? WHERE owed_by_me_entry_id = ?", (new_id, old_id))


# --------------------------------------------------------------------------- #
# matches
# --------------------------------------------------------------------------- #

def create_match(conn, *, owed_to_me_entry_id, owed_by_me_entry_id, friend_due_account_id, amount, now) -> dict:
    cur = conn.execute(
        """INSERT INTO bill_match (owed_to_me_entry_id, owed_by_me_entry_id, friend_due_account_id, amount,
                                    created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)""",
        (owed_to_me_entry_id, owed_by_me_entry_id, friend_due_account_id, amount, now, now))
    return get_match(conn, cur.lastrowid)


def get_match(conn, match_id) -> Optional[dict]:
    return _row(conn.execute("SELECT * FROM bill_match WHERE id = ?", (match_id,)).fetchone())


def find_match(conn, owed_to_me_entry_id, owed_by_me_entry_id, friend_due_account_id) -> Optional[dict]:
    return _row(conn.execute(
        """SELECT * FROM bill_match WHERE owed_to_me_entry_id = ? AND owed_by_me_entry_id = ?
              AND friend_due_account_id = ?""",
        (owed_to_me_entry_id, owed_by_me_entry_id, friend_due_account_id)).fetchone())


def update_match_amount(conn, match_id, amount, now) -> None:
    conn.execute("UPDATE bill_match SET amount = ?, updated_at = ? WHERE id = ?", (amount, now, match_id))


def delete_match(conn, match_id) -> None:
    conn.execute("DELETE FROM bill_match WHERE id = ?", (match_id,))


def matches_for_bill(conn, entry_id, due_account_id=None) -> list[dict]:
    q = "SELECT * FROM bill_match WHERE (owed_to_me_entry_id = ? OR owed_by_me_entry_id = ?)"
    params: list[Any] = [entry_id, entry_id]
    if due_account_id is not None:
        q += " AND friend_due_account_id = ?"
        params.append(due_account_id)
    return _rows(conn.execute(q + " ORDER BY id", params).fetchall())


def matches_for_friend(conn, due_account_id) -> list[dict]:
    return _rows(conn.execute(
        "SELECT * FROM bill_match WHERE friend_due_account_id = ? ORDER BY id", (due_account_id,)).fetchall())


def delete_matches_for_bill(conn, entry_id, due_account_id=None) -> None:
    for m in matches_for_bill(conn, entry_id, due_account_id):
        delete_match(conn, m["id"])
