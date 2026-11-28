"""Statement application service: read-only projections over the ledger --
account balances, and a friend's running-balance statement (the replacement
for V1's per-share OPEN/CLOSED tracking: just list every posting against their
DUE account in order, with a running total, exactly like a bank statement).
"""

from __future__ import annotations

from monetary.domain.enums import AccountType
from monetary.infrastructure import bill_repository as bill_repo
from monetary.infrastructure import repositories as repo


def account_balances(conn, include_inactive=False) -> list[dict]:
    accounts = repo.list_accounts(
        conn, account_types=(AccountType.ASSET.value, AccountType.LIABILITY.value),
        include_inactive=include_inactive,
    )
    results = []
    for acc in accounts:
        normal_side = AccountType(acc["account_type"]).normal_side.value
        points = repo.account_balance_points(conn, acc["id"], normal_side)
        results.append({
            "account_id": acc["id"], "name": acc["name"], "account_type": acc["account_type"],
            "is_active": bool(acc["is_active"]), "currency": acc["currency_code"], "points": points,
        })
    return results


def friend_balances(conn) -> list[dict]:
    """Every friend's current DUE balance. Positive = they owe you; negative =
    you owe them; zero = settled up. `fronted_unpaid_points` is the part of what they paid for you
    that you have not repaid (see fronted_unpaid: tied to bills)."""
    rows = _due_balances(conn)
    unpaid: dict[int, int] = {}
    for f in fronted_unpaid(conn):
        unpaid[f["friend_id"]] = unpaid.get(f["friend_id"], 0) + f["unpaid_points"]
    return [{**r, "fronted_unpaid_points": unpaid.get(r["friend_id"], 0)} for r in rows]


def _due_balances(conn) -> list[dict]:
    due_accounts = repo.friend_open_balance_accounts(conn)
    results = []
    for acc in due_accounts:
        points = repo.account_balance_points(conn, acc["id"], AccountType.DUE.normal_side.value)
        results.append({
            "friend_id": acc["counterparty_id"], "friend_name": acc["friend_name"],
            "due_account_id": acc["id"], "currency": acc["currency_code"], "points": points,
        })
    return results


def friend_statement(conn, due_account_id) -> list[dict]:
    """Every posting against one friend's DUE account, in order, with a running
    balance -- the bank-statement-style replacement for per-share status tracking."""
    return _statement(conn, due_account_id, AccountType.DUE.normal_side.value, include_reversed=True)


def account_statement(conn, account_id: int, account_type: str) -> list[dict]:
    """The activity of one asset/liability account: every posting in date order with the balance after it
    (for a liability, the amount owed). Reversed entries and their reversals are left out -- they cancel."""
    return _statement(conn, account_id, AccountType(account_type).normal_side.value, include_reversed=False)


def _statement(conn, account_id: int, normal_side: str, *, include_reversed: bool) -> list[dict]:
    entries = repo.list_journal_entries(conn, account_id=account_id, include_reversed=include_reversed)
    entries = sorted(entries, key=lambda e: (e["entry_date"], e["id"]))
    running = 0
    rows = []
    for e in entries:
        postings = [p for p in repo.postings_for_entry(conn, e["id"]) if p["account_id"] == account_id]
        for p in postings:
            delta = p["debit_amount"] - p["credit_amount"]
            if normal_side != "DEBIT":
                delta = -delta
            # a reversed original and its REVERSAL entry cancel out, so neither
            # contributes to the running balance (both rows are still listed)
            if e["status"] == "POSTED" and e["entry_type"] != "REVERSAL":
                running += delta
            rows.append({
                "entry_id": e["id"], "description": e["description"], "entry_type": e["entry_type"],
                "entry_date": e["entry_date"], "status": e["status"], "delta_points": delta,
                "running_balance_points": running, "settles_entry_id": e["settles_entry_id"],
                "payment_group": e["payment_group"],
            })
    return rows


def fronted_unpaid(conn) -> list[dict]:
    """How much of each friend-fronted expense is still unpaid: what is left on the bill after the payments
    tied to it and the matches set against it (see bill_service). Each row: entry id, friend, category, date,
    amount and unpaid (points)."""
    entries = repo.posted_fronted_entries(conn)
    bill_rows = bill_repo.bills_for_entries(conn, [e["id"] for e in entries])
    rows = []
    for e in entries:
        bill = next((b for b in bill_rows.get(e["id"], []) if b["due_account_id"] == e["due_account_id"]), None)
        unpaid = max(bill["amount"] - bill["paid"] - bill["matched"], 0) if bill else e["amount"]
        rows.append({
            "entry_id": e["id"], "friend_id": e["friend_id"], "category_id": e["category_id"],
            "entry_date": e["entry_date"], "amount_points": e["amount"], "unpaid_points": unpaid,
        })
    return rows
