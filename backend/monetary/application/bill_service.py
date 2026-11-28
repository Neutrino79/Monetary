"""Bills: a split or a friend-paid entry as one friend sees it, and what is tied to it.

A bill is "what this friend owes you" (a SPLIT) or "what you owe this friend" (a FRONTED expense). Two things
cover it: payments (settlement entries tied to the bill, real money) and matches (a bill you owe the friend
set against a bill they owe you, no money). `paid`, `matched` and `remaining` are always summed from those
rows -- nothing is stored, so nothing can drift.

The layers form a stack: bills at the bottom, matches over them, payments on top. A layer cannot change while
the layer above it depends on it, so removing a bill, lowering its share or un-matching a pair first needs
the payments tied to the bills involved to go. `apply_bill_change` is that rule, used by every edit and
delete of a bill; callers pass `remove_linked=True` once the user has agreed to remove what is attached.
"""

from __future__ import annotations

from monetary.application.edit_policies import get_edit_policy
from monetary.domain.exceptions import BillDependencyError, NotFoundError
from monetary.domain.money import Money
from monetary.domain.time_utils import utc_iso_to_local_date
from monetary.infrastructure import bill_repository as bills
from monetary.infrastructure import repositories as repo

THEY_OWE_YOU = "they_owe_you"      # a split: the friend's share
YOU_OWE_THEM = "you_owe_them"      # a friend-paid expense: your share


def direction_of(entry_type: str) -> str:
    return THEY_OWE_YOU if entry_type == "SPLIT" else YOU_OWE_THEM


def remaining(bill: dict) -> int:
    return bill["amount"] - bill["paid"] - bill["matched"]


def status_of(bill: dict) -> str:
    if remaining(bill) <= 0:
        return "paid"
    return "partial" if bill["paid"] + bill["matched"] > 0 else "unpaid"


def bill_view(bill: dict, owner_tz: str | None) -> dict:
    return {
        "entry_id": bill["id"], "friend_id": bill["friend_id"], "type": bill["entry_type"].lower(),
        "direction": direction_of(bill["entry_type"]), "description": bill["description"],
        "date": utc_iso_to_local_date(bill["entry_date"], owner_tz), "currency": bill["currency_code"],
        "category_id": bill["category_id"], "amount_points": bill["amount"], "paid_points": bill["paid"],
        "matched_points": bill["matched"], "remaining_points": remaining(bill), "status": status_of(bill),
    }


def require_friend(conn, friend_id) -> tuple[dict, dict]:
    friend = repo.get_contact(conn, friend_id)
    if friend is None:
        raise NotFoundError(f"Friend {friend_id} not found.")
    due = repo.get_due_account_for_friend(conn, friend_id)
    if due is None:
        raise NotFoundError(f"Friend {friend_id} has no balance account.")
    return friend, due


def friend_bills(conn, owner: dict, friend_id: int, *, only_open: bool = False) -> list[dict]:
    _friend, due = require_friend(conn, friend_id)
    rows = bills.friend_bills(conn, due["id"])
    if only_open:
        rows = [b for b in rows if remaining(b) > 0]
    return [bill_view(b, owner["timezone"]) for b in rows]


def statuses_for(conn, entry_ids: list[int]) -> dict[int, list[dict]]:
    """Per-friend bill rows of the given entries, for the transaction views."""
    return bills.bills_for_entries(conn, entry_ids)


def unassigned_count(conn, due_account_id: int) -> int:
    return len(bills.unassigned_payments(conn, due_account_id))


# --------------------------------------------------------------------------- #
# the stack rule
# --------------------------------------------------------------------------- #

def _payment_detail(conn, payment: dict, owner_tz, bill_description: str, friend_name: str) -> dict:
    return {"id": payment["id"], "date": utc_iso_to_local_date(payment["entry_date"], owner_tz),
            "amount_points": payment["amount"], "bill_id": payment["settles_entry_id"],
            "bill_description": bill_description, "friend_name": friend_name}


def _describe(items: list[dict], currency: str) -> str:
    return "; ".join(f"{Money(p['amount_points'], currency)} on {p['date']} ({p['bill_description']})" for p in items)


def apply_bill_change(conn, owner: dict, entry_id: int, new_shares: dict[int, int] | None, *,
                      remove_linked: bool) -> None:
    """Check (and, when agreed, clear) what is tied to a bill before it is edited or deleted.

    `new_shares` maps each friend's DUE account id to their share after the change; a friend who is absent
    (or `None` for the whole bill: deleted, or turned into a plain expense) ends with no share. A friend whose
    share drops to nothing, or below what is already covered, must lose the payments and matches on it. Their
    matches are removed without fuss when no money is involved; payments always need `remove_linked`.
    """
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        return
    tz = owner["timezone"]
    currency = entry["currency_code"]
    payments: list[dict] = []
    matches: list[dict] = []
    clear: list[int] = []
    for due_id in bills.bill_friends(conn, entry_id):
        bill = bills.get_bill(conn, entry_id, due_id)
        if bill is None:
            continue
        new = (new_shares or {}).get(due_id, 0)
        if not (new == 0 or new < bill["paid"] + bill["matched"]):
            continue
        clear.append(due_id)
        friend = repo.get_contact(conn, bill["friend_id"]) or {"name": "a removed friend"}
        for p in bills.payments_for_bill(conn, entry_id, due_id):
            payments.append(_payment_detail(conn, p, tz, bill["description"], friend["name"]))
        for m in bills.matches_for_bill(conn, entry_id, due_id):
            other_id = m["owed_by_me_entry_id"] if m["owed_to_me_entry_id"] == entry_id else m["owed_to_me_entry_id"]
            other = repo.get_journal_entry(conn, other_id)
            matches.append({"id": m["id"], "amount_points": m["amount"], "other_bill_id": other_id,
                            "other_bill_description": other["description"] if other else "a removed bill"})
            for p in bills.payments_for_bill(conn, other_id, due_id):   # the other bill's payments rest on this match
                payments.append(_payment_detail(conn, p, tz, other["description"] if other else "", friend["name"]))
    if not clear:
        return
    if payments and not remove_linked:
        raise BillDependencyError(
            f"Payments depend on '{entry['description']}': {_describe(payments, currency)}. "
            "Delete them first, or remove them together with this change.",
            {"payments": payments, "matches": matches, "bill_id": entry_id,
             "bill_description": entry["description"]})
    if matches and not remove_linked and any(
            new_shares is not None and new_shares.get(d, 0) > 0 for d in clear):
        # lowering a share below what is matched, with no money involved: say what to un-match
        raise BillDependencyError(
            f"'{entry['description']}' is matched against other bills, so its share can't drop that low. "
            "Remove the matches first, or remove them together with this change.",
            {"payments": [], "matches": matches, "bill_id": entry_id, "bill_description": entry["description"]})
    policy = get_edit_policy(owner["ledger_mode"])
    for payment_id in dict.fromkeys(p["id"] for p in payments):
        policy.delete(conn, payment_id)
    for due_id in clear:
        bills.delete_matches_for_bill(conn, entry_id, due_id)


def follow_correction(conn, old_id: int, new_entry: dict) -> None:
    """A STRICT-mode correction replaces the bill with a new entry; payments and matches follow it."""
    if new_entry["id"] != old_id:
        bills.repoint_bill(conn, old_id, new_entry["id"])
