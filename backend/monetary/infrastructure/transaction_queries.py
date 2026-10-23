"""Read-side SQL for the flat transaction list: filtering by the *flat* type
(expense/income are both NORMAL entries told apart by their category), by
friend, by account, by category subtree, plus sorting on the headline amount.
Pure data access -- no business rules."""

from __future__ import annotations

from typing import Any

from monetary.domain.time_utils import utc_iso_to_local_date

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


# The real (asset/liability) account a flat row is shown against: the debited-from leg of a transfer,
# otherwise the first real leg -- the same choice transaction_view._derive makes.
GROUP_ACCOUNT_ID_SQL = (
    "(SELECT p.account_id FROM posting p JOIN account a ON a.id = p.account_id "
    "WHERE p.journal_entry_id = je.id AND a.account_type IN ('ASSET','LIABILITY') "
    "AND (je.entry_type != 'TRANSFER' OR p.credit_amount > 0) ORDER BY p.id LIMIT 1)"
)
GROUP_BYS = ("date", "month", "category", "account", "type")


def _group_sql(group_by: str) -> tuple[str, str, str]:
    """(key, label, order) SQL for a grouping. Dates group on the owner's *local* day, which SQLite
    cannot compute, so the `local_day(entry_date)` function registered by `_register_local_day` is used."""
    if group_by == "date":
        return "local_day(je.entry_date)", "local_day(je.entry_date)", "{k}"
    if group_by == "month":
        return "substr(local_day(je.entry_date), 1, 7)", "substr(local_day(je.entry_date), 1, 7)", "{k}"
    if group_by == "category":
        return ("COALESCE(CAST(je.category_id AS TEXT), '')", "COALESCE(c.name, 'No category')",
                "LOWER({l}), {k}")
    if group_by == "type":
        return FLAT_TYPE_SQL, FLAT_TYPE_SQL, "{k}"
    if group_by == "account":
        return (f"COALESCE(CAST({GROUP_ACCOUNT_ID_SQL} AS TEXT), '')",
                f"COALESCE((SELECT name FROM account WHERE id = {GROUP_ACCOUNT_ID_SQL}), 'No account')",
                "LOWER({l}), {k}")
    raise ValueError(f"unknown group_by {group_by!r}")


def _register_local_day(conn, tz_name: str | None) -> None:
    conn.create_function("local_day", 1, lambda iso: utc_iso_to_local_date(iso, tz_name), deterministic=True)


# 1 when the owner's real account was debited (money came in) -- same rule as transaction_view
SETTLEMENT_RECEIVES_SQL = (
    "(SELECT p.debit_amount > 0 FROM posting p JOIN account a ON a.id = p.account_id "
    "WHERE p.journal_entry_id = je.id AND a.account_type IN ('ASSET','LIABILITY') ORDER BY p.id LIMIT 1)"
)


def _where(*, account_id, category_ids, friend_id, refund_of_id, flat_types, search, status,
           date_from, date_to_exclusive, settlement_direction=None) -> tuple[list[str], list[Any]]:
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
    if settlement_direction:
        # only narrows settlements: every other kind of row is untouched
        where.append(f"(je.entry_type != 'SETTLEMENT' OR {SETTLEMENT_RECEIVES_SQL} = ?)")
        params.append(1 if settlement_direction == "receive" else 0)
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
    return where, params


_FROM = "FROM journal_entry je LEFT JOIN account c ON c.id = je.category_id WHERE "


def search_entries(conn, *, account_id=None, category_ids=None, friend_id=None, refund_of_id=None, flat_types=None,
                   search=None, status="posted", date_from=None, date_to_exclusive=None,
                   sort="date", direction="desc", limit=50, offset=0,
                   group_by=None, tz_name=None, settlement_direction=None) -> tuple[list[dict], int]:
    """With `group_by`, rows come back clustered by group (so a group is contiguous across pages) and
    each carries `group_key`; `sort`/`direction` then order the rows inside a group."""
    where, params = _where(
        account_id=account_id, category_ids=category_ids, friend_id=friend_id, refund_of_id=refund_of_id,
        flat_types=flat_types, search=search, status=status, date_from=date_from, date_to_exclusive=date_to_exclusive,
        settlement_direction=settlement_direction)
    base = _FROM + " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) AS n {base}", params).fetchone()["n"]
    order = _SORTS[sort].format(d="ASC" if direction == "asc" else "DESC")
    select = "je.*"
    if group_by:
        _register_local_day(conn, tz_name)
        key, label, group_order = _group_sql(group_by)
        # date/month groups follow the sort direction (newest first by default); the rest are alphabetical
        group_order = group_order.format(k="group_key", l="group_label")     # by alias: ORDER BY can't nest je refs
        if group_by in ("date", "month"):
            group_order += " ASC" if direction == "asc" else " DESC"
        select = f"je.*, {key} AS group_key, {label} AS group_label"
        order = f"{group_order}, {order}"
    rows = conn.execute(f"SELECT {select} {base} ORDER BY {order} LIMIT ? OFFSET ?",
                        [*params, limit, offset]).fetchall()
    return [dict(r) for r in rows], total


def group_summary(conn, *, group_by, tz_name, account_id=None, category_ids=None, friend_id=None,
                  refund_of_id=None, flat_types=None, search=None, status="posted", date_from=None,
                  date_to_exclusive=None, direction="desc", settlement_direction=None) -> list[dict]:
    """One row per group and currency: key, label, count and the money in/out (income+refund vs expenses)."""
    where, params = _where(
        account_id=account_id, category_ids=category_ids, friend_id=friend_id, refund_of_id=refund_of_id,
        flat_types=flat_types, search=search, status=status, date_from=date_from, date_to_exclusive=date_to_exclusive,
        settlement_direction=settlement_direction)
    _register_local_day(conn, tz_name)
    key, label, group_order = _group_sql(group_by)
    group_order = group_order.format(k="group_key", l="group_label")
    if group_by in ("date", "month"):
        group_order += " ASC" if direction == "asc" else " DESC"
    ftype = FLAT_TYPE_SQL
    sql = (f"SELECT {key} AS group_key, {label} AS group_label, je.currency_code AS currency, COUNT(*) AS n, "
           f"COALESCE(SUM(CASE WHEN {ftype} IN ('income','refund') THEN {AMOUNT_SQL} END), 0) AS in_points, "
           f"COALESCE(SUM(CASE WHEN {ftype} = 'expense' THEN {AMOUNT_SQL} END), 0) AS out_points "
           f"{_FROM}{' AND '.join(where)} GROUP BY group_key, je.currency_code ORDER BY {group_order}, currency")
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


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
