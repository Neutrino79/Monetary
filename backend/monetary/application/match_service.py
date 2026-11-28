"""Matches: setting a bill you owe a friend against a bill they owe you.

A match moves no money and leaves the friend's balance alone (it already nets both directions); it only says
that part of one bill is covered by part of the other, so each shows less left to settle. The pair is a split
(they owe you) and a friend-paid expense (you owe them) for the same friend, for any amount up to what is left
on both. Payments sit above matches in the stack: while a payment is tied to either bill the match is locked,
unless the caller agrees (`remove_linked`) to delete those payments together with the change.
"""

from __future__ import annotations

from monetary.application import bill_service
from monetary.application.edit_policies import get_edit_policy
from monetary.domain.exceptions import BillDependencyError, ConflictError, NotFoundError, ValidationError
from monetary.domain.money import Money
from monetary.domain.time_utils import utc_iso_to_local_date, utc_now_iso
from monetary.infrastructure import bill_repository as bills
from monetary.infrastructure import repositories as repo


def _match_view(conn, owner: dict, m: dict) -> dict:
    to_me = repo.get_journal_entry(conn, m["owed_to_me_entry_id"])
    by_me = repo.get_journal_entry(conn, m["owed_by_me_entry_id"])
    due = repo.get_account(conn, m["friend_due_account_id"])
    tz = owner["timezone"]
    return {
        "id": m["id"], "friend_id": due["counterparty_id"], "amount_points": m["amount"],
        "currency": to_me["currency_code"],
        "owed_to_me": {"entry_id": to_me["id"], "description": to_me["description"],
                       "date": utc_iso_to_local_date(to_me["entry_date"], tz)},
        "owed_by_me": {"entry_id": by_me["id"], "description": by_me["description"],
                       "date": utc_iso_to_local_date(by_me["entry_date"], tz)},
        "locked": bool(_attached_payments(conn, m)),
        "created_at": m["created_at"], "updated_at": m["updated_at"],
    }


def _attached_payments(conn, m: dict) -> list[dict]:
    due_id = m["friend_due_account_id"]
    return (bills.payments_for_bill(conn, m["owed_to_me_entry_id"], due_id)
            + bills.payments_for_bill(conn, m["owed_by_me_entry_id"], due_id))


def list_matches(conn, owner: dict, friend_id: int) -> list[dict]:
    _friend, due = bill_service.require_friend(conn, friend_id)
    return [_match_view(conn, owner, m) for m in bills.matches_for_friend(conn, due["id"])]


def _bill_or_raise(conn, entry_id: int, due_id: int, expected_type: str, friend_name: str) -> dict:
    bill = bills.get_bill(conn, entry_id, due_id)
    if bill is None or bill["entry_type"] != expected_type:
        what = "a split with" if expected_type == "SPLIT" else "an expense paid by"
        raise ValidationError(f"Entry {entry_id} is not {what} {friend_name}.")
    return bill


def create_match(conn, owner: dict, *, friend_id: int, owed_to_me_id: int, owed_by_me_id: int,
                 amount_major: str) -> dict:
    friend, due = bill_service.require_friend(conn, friend_id)
    to_me = _bill_or_raise(conn, owed_to_me_id, due["id"], "SPLIT", friend["name"])
    by_me = _bill_or_raise(conn, owed_by_me_id, due["id"], "FRONTED", friend["name"])
    money = Money.from_major_units(amount_major, to_me["currency_code"])
    for bill in (to_me, by_me):
        left = bill_service.remaining(bill)
        if money.points > left:
            raise ConflictError(
                f"Only {Money(max(left, 0), bill['currency_code'])} is left on '{bill['description']}', "
                f"so {money} can't be matched against it.")
    now = utc_now_iso()
    existing = bills.find_match(conn, owed_to_me_id, owed_by_me_id, due["id"])
    if existing is not None:                         # matching the same pair again adds to it
        bills.update_match_amount(conn, existing["id"], existing["amount"] + money.points, now)
        return _match_view(conn, owner, bills.get_match(conn, existing["id"]))
    created = bills.create_match(conn, owed_to_me_entry_id=owed_to_me_id, owed_by_me_entry_id=owed_by_me_id,
                                 friend_due_account_id=due["id"], amount=money.points, now=now)
    return _match_view(conn, owner, created)


def _require_match(conn, match_id: int) -> dict:
    m = bills.get_match(conn, match_id)
    if m is None:
        raise NotFoundError(f"Match {match_id} not found.")
    return m


def _lock(conn, owner: dict, m: dict, *, remove_linked: bool) -> None:
    """Payments on either bill rest on the match: refuse, or delete them when the caller agreed."""
    payments = _attached_payments(conn, m)
    if not payments:
        return
    tz = owner["timezone"]
    to_me = repo.get_journal_entry(conn, m["owed_to_me_entry_id"])
    by_me = repo.get_journal_entry(conn, m["owed_by_me_entry_id"])
    names = {to_me["id"]: to_me["description"], by_me["id"]: by_me["description"]}
    details = {"payments": [
        {"id": p["id"], "date": utc_iso_to_local_date(p["entry_date"], tz), "amount_points": p["amount"],
         "bill_id": p["settles_entry_id"], "bill_description": names.get(p["settles_entry_id"], "")}
        for p in payments], "matches": [], "bill_id": None, "bill_description": None}
    if not remove_linked:
        listed = "; ".join(f"{Money(p['amount_points'], to_me['currency_code'])} on {p['date']} "
                           f"({p['bill_description']})" for p in details["payments"])
        raise BillDependencyError(
            f"This match is locked: payments are tied to '{to_me['description']}' or '{by_me['description']}' "
            f"({listed}). Delete them first, or remove them together with this change.", details)
    policy = get_edit_policy(owner["ledger_mode"])
    for p in payments:
        policy.delete(conn, p["id"])


def update_match(conn, owner: dict, match_id: int, *, amount_major: str, remove_linked: bool = False) -> dict:
    m = _require_match(conn, match_id)
    to_me = repo.get_journal_entry(conn, m["owed_to_me_entry_id"])
    money = Money.from_major_units(amount_major, to_me["currency_code"])
    _lock(conn, owner, m, remove_linked=remove_linked)
    if money.points > m["amount"]:                   # growing needs room on both bills
        extra = money.points - m["amount"]
        for entry_id in (m["owed_to_me_entry_id"], m["owed_by_me_entry_id"]):
            bill = bills.get_bill(conn, entry_id, m["friend_due_account_id"])
            if bill is None or bill_service.remaining(bill) < extra:
                raise ConflictError(f"Not enough is left on '{bill['description'] if bill else entry_id}' "
                                    f"to match {Money(extra, to_me['currency_code'])} more.")
    bills.update_match_amount(conn, match_id, money.points, utc_now_iso())
    return _match_view(conn, owner, bills.get_match(conn, match_id))


def delete_match(conn, owner: dict, match_id: int, *, remove_linked: bool = False) -> None:
    m = _require_match(conn, match_id)
    _lock(conn, owner, m, remove_linked=remove_linked)
    bills.delete_match(conn, match_id)
