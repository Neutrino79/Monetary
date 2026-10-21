"""Read-side SQL for the flat transaction list: filtering by the *flat* type
(expense/income are both NORMAL entries told apart by their category), by
friend, by account, by category subtree, plus sorting on the headline amount.
Pure data access -- no business rules."""

from __future__ import annotations

from typing import Any

# Flat type of an entry. NORMAL entries are expense or income depending on the
# category they were booked against; every other entry type maps 1:1.
FLAT_TYPE_SQL = (
    "CASE WHEN je.entry_type = 'NORMAL' THEN "
    "CASE c.account_type WHEN 'EXPENSE' THEN 'expense' ELSE 'income' END "
    "ELSE LOWER(je.entry_type) END"
)
# Headline amount: the largest single leg (equals the total for every type).
AMOUNT_SQL = "(SELECT MAX(debit_amount + credit_amount) FROM posting WHERE journal_entry_id = je.id)"

_SORTS = {
    "date": "je.entry_date {d}, je.id {d}",
    "amount": AMOUNT_SQL + " {d}, je.id DESC",
    "description": "LOWER(je.description) {d}, je.id DESC",
}


def search_entries(conn, *, account_id=None, category_ids=None, friend_id=None, refund_of_id=None, flat_types=None,
                   search=None, status="posted", date_from=None, date_to_exclusive=None,
                   sort="date", direction="desc", limit=50, offset=0) -> tuple[list[dict], int]:
    where = ["je.entry_type != 'REVERSAL'"]
    params: list[Any] = []
    if status == "posted":
        where.append("je.status = 'POSTED'")
    elif status == "reversed":
        where.append("je.status = 'REVERSED'")
    if account_id is not None:
        where.append("EXISTS (SELECT 1 FROM posting p WHERE p.journal_entry_id = je.id AND p.account_id = ?)")
        params.append(account_id)
    if category_ids:
        where.append(f"je.category_id IN ({','.join('?' for _ in category_ids)})")
        params.extend(category_ids)
    if friend_id is not None:
        where.append("EXISTS (SELECT 1 FROM posting pf JOIN account af ON af.id = pf.account_id "
                     "WHERE pf.journal_entry_id = je.id AND af.counterparty_user_id = ?)")
        params.append(friend_id)
    if refund_of_id is not None:
        where.append("je.refund_of_id = ?")
        params.append(refund_of_id)
    if flat_types:
        where.append(f"({FLAT_TYPE_SQL}) IN ({','.join('?' for _ in flat_types)})")
        params.extend(flat_types)
    if date_from is not None:
        where.append("je.entry_date >= ?")
        params.append(date_from)
    if date_to_exclusive is not None:
        where.append("je.entry_date < ?")
        params.append(date_to_exclusive)
    if search:
        where.append("(je.description LIKE ? OR je.memo LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like])

    base = "FROM journal_entry je LEFT JOIN account c ON c.id = je.category_id WHERE " + " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) AS n {base}", params).fetchone()["n"]
    order = _SORTS[sort].format(d="ASC" if direction == "asc" else "DESC")
    rows = conn.execute(f"SELECT je.* {base} ORDER BY {order} LIMIT ? OFFSET ?",
                        [*params, limit, offset]).fetchall()
    return [dict(r) for r in rows], total


def postings_with_accounts(conn, entry_ids: list[int]) -> dict[int, list[dict]]:
    """entry_id -> postings, each joined with the account facts the flat view needs."""
    if not entry_ids:
        return {}
    marks = ",".join("?" for _ in entry_ids)
    rows = conn.execute(
        f"SELECT p.journal_entry_id, p.account_id, p.debit_amount, p.credit_amount, "
        f"a.account_type, a.counterparty_user_id "
        f"FROM posting p JOIN account a ON a.id = p.account_id "
        f"WHERE p.journal_entry_id IN ({marks}) ORDER BY p.id", entry_ids).fetchall()
    out: dict[int, list[dict]] = {}
    for r in rows:
        out.setdefault(r["journal_entry_id"], []).append(dict(r))
    return out


def replacements_for(conn, entry_ids: list[int]) -> dict[int, int]:
    """original_entry_id -> id of the entry that replaced it (STRICT-mode correction)."""
    if not entry_ids:
        return {}
    marks = ",".join("?" for _ in entry_ids)
    rows = conn.execute(
        f"SELECT id, correction_of_id FROM journal_entry WHERE correction_of_id IN ({marks})", entry_ids
    ).fetchall()
    return {r["correction_of_id"]: r["id"] for r in rows}
