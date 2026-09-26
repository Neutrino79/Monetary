"""Statement application service: read-only projections over the ledger --
account balances, and a friend's running-balance statement (the replacement
for V1's per-share OPEN/CLOSED tracking: just list every posting against their
DUE account in order, with a running total, exactly like a bank statement).
"""

from __future__ import annotations

from duevia.domain.enums import AccountType
from duevia.infrastructure import repositories as repo


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
    you owe them; zero = settled up."""
    due_accounts = repo.friend_open_balance_accounts(conn)
    results = []
    for acc in due_accounts:
        points = repo.account_balance_points(conn, acc["id"], AccountType.DUE.normal_side.value)
        results.append({
            "friend_id": acc["counterparty_user_id"], "friend_name": acc["friend_name"],
            "due_account_id": acc["id"], "currency": acc["currency_code"], "points": points,
        })
    return results


def friend_statement(conn, due_account_id) -> list[dict]:
    """Every posting against one friend's DUE account, in order, with a running
    balance -- the bank-statement-style replacement for per-share status tracking."""
    entries = repo.list_journal_entries(conn, account_id=due_account_id, include_reversed=True)
    entries = sorted(entries, key=lambda e: (e["entry_date"], e["id"]))
    running = 0
    rows = []
    for e in entries:
        postings = [p for p in repo.postings_for_entry(conn, e["id"]) if p["account_id"] == due_account_id]
        for p in postings:
            delta = p["debit_amount"] - p["credit_amount"]  # DUE normal side = DEBIT
            if e["status"] == "POSTED":
                running += delta
            rows.append({
                "entry_id": e["id"], "description": e["description"], "entry_type": e["entry_type"],
                "entry_date": e["entry_date"], "status": e["status"], "delta_points": delta,
                "running_balance_points": running,
            })
    return rows
