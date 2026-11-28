"""Settlement application service: paying bills.

A settlement is real money moving between you and a friend, and it is always for specific bills: you choose
the splits they owe you (they pay you) or the friend-paid expenses you owe them (you pay them) and an amount on
each. One settlement entry is posted per bill, all sharing a `payment_group` so they show up as one payment.
The direction and the cap come from the bill (never from the sign of the balance), so a bill you owe can be paid
while the friend owes you more overall.

Payments can't be edited, only deleted and entered again; the one exception is the note. Settlements recorded
before bills were settled one by one carry no bill ("unassigned payments"): `assign_settlement` ties one to the
bills it paid, and a friend with unassigned payments can't take new ones until they are tied.
"""

from __future__ import annotations

import uuid

from monetary.application import bill_service, ledger_service
from monetary.application.edit_policies import get_edit_policy
from monetary.application.posting_strategies import settlement as settlement_strategy
from monetary.domain.enums import AccountType, EntryType
from monetary.domain.exceptions import ConflictError, NotFoundError, ValidationError
from monetary.domain.ledger import LedgerIntent
from monetary.domain.money import Money
from monetary.domain.time_utils import parse_local_to_utc_iso, utc_iso_to_local_date, utc_now_iso
from monetary.infrastructure import bill_repository as bills
from monetary.infrastructure import repositories as repo


def _require_real_account(conn, account_id) -> dict:
    acc = repo.get_account(conn, account_id)
    if acc is None or acc["account_type"] not in (AccountType.ASSET.value, AccountType.LIABILITY.value):
        raise NotFoundError(f"Account {account_id} not found.")
    if not acc["is_active"]:
        raise ValidationError(f"Account {account_id} is inactive.")
    return acc


def _plan(conn, friend: dict, due: dict, currency: str, allocations) -> list[tuple[dict, Money]]:
    """Turn [(bill id, amount)] into [(bill row, Money)], enforcing: at least one, no repeats, real bills of this
    friend, one direction, and no more than what is left on each."""
    if not allocations:
        raise ValidationError("Choose at least one bill to settle.")
    seen: set[int] = set()
    plan: list[tuple[dict, Money]] = []
    for bill_id, amount_major in allocations:
        if bill_id in seen:
            raise ValidationError(f"Bill {bill_id} appears more than once.")
        seen.add(bill_id)
        bill = bills.get_bill(conn, bill_id, due["id"])
        if bill is None:
            raise ValidationError(f"Entry {bill_id} is not a split or friend-paid expense with {friend['name']}.")
        if bill["currency_code"] != currency:
            raise ValidationError(f"Currency mismatch: '{bill['description']}' is in {bill['currency_code']}, "
                                  f"the payment is in {currency}.")
        money = Money.from_major_units(amount_major, currency)
        left = bill_service.remaining(bill)
        if money.points > left:
            raise ConflictError(f"Only {Money(max(left, 0), currency)} is left on '{bill['description']}', "
                                f"so {money} can't be paid against it.")
        plan.append((bill, money))
    if len({b["entry_type"] for b, _ in plan}) > 1:
        raise ValidationError("Settle one direction at a time: either what they owe you or what you owe them. "
                              "Match the bills against each other first to pay a single net amount.")
    return plan


def _post_payment(conn, friend: dict, due: dict, account: dict, plan, *, entry_date: str, note,
                  group: str) -> list[dict]:
    entries = []
    for bill, money in plan:
        build = (settlement_strategy.build_settlement if bill["entry_type"] == "SPLIT"
                 else settlement_strategy.build_repayment)
        lead = "Settlement from" if bill["entry_type"] == "SPLIT" else "Payment to"
        intent = build(real_account_id=account["id"], friend_due_account_id=due["id"], amount=money,
                       description=f"{lead} {friend['name']} — {bill['description']}",
                       entry_date=entry_date, memo=note)
        entry = ledger_service.post(conn, intent)
        bills.set_settlement_link(conn, entry["id"], bill["id"], group)
        entries.append(repo.get_journal_entry(conn, entry["id"]))
    return entries


def create_settlement(conn, owner, *, friend_id, account_id, allocations, date_str=None, note=None) -> list[dict]:
    """`allocations`: [(bill entry id, amount)]. Returns the settlement entries, one per bill."""
    friend, due = bill_service.require_friend(conn, friend_id)
    account = _require_real_account(conn, account_id)
    if account["currency_code"] != due["currency_code"]:
        raise ValidationError(f"Currency mismatch: account is {account['currency_code']}, "
                              f"{friend['name']}'s balance is {due['currency_code']}.")
    if bill_service.unassigned_count(conn, due["id"]):
        raise ConflictError(f"{friend['name']} has earlier payments that are not tied to a bill yet. "
                            "Tie them to the bills they paid first, so each bill shows what is really left.")
    plan = _plan(conn, friend, due, account["currency_code"], allocations)
    if date_str:
        for bill, _ in plan:
            bill_date = utc_iso_to_local_date(bill["entry_date"], owner["timezone"])
            if date_str < bill_date:
                raise ValidationError(f"A payment can't be dated before the bill it pays "
                                      f"('{bill['description']}', {bill_date}).")
    entry_date = parse_local_to_utc_iso(date_str, owner["timezone"]) if date_str else utc_now_iso()
    return _post_payment(conn, friend, due, account, plan, entry_date=entry_date, note=note,
                         group=uuid.uuid4().hex[:12])


def list_settlements(conn, friend_id=None) -> list[dict]:
    if friend_id is None:
        return repo.list_journal_entries(conn, entry_types=[EntryType.SETTLEMENT.value])
    due = repo.get_due_account_for_friend(conn, friend_id)
    if due is None:
        return []
    return repo.list_journal_entries(conn, account_id=due["id"], entry_types=[EntryType.SETTLEMENT.value])


def _require_settlement_entry(conn, entry_id) -> dict:
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        raise NotFoundError(f"Settlement {entry_id} not found.")
    if entry["entry_type"] != EntryType.SETTLEMENT.value:
        raise ValidationError(f"Entry {entry_id} is not a settlement.")
    return entry


def edit_settlement(conn, owner, entry_id, *, note) -> dict:
    """Only the note can change. Anything else: delete the payment and record it again."""
    entry = _require_settlement_entry(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Settlement {entry_id} has already been reversed/replaced.")
    intent = LedgerIntent(
        description=entry["description"], entry_type=EntryType.SETTLEMENT, currency_code=entry["currency_code"],
        entry_date=entry["entry_date"], memo=note if note is not None else entry["memo"],
        legs=ledger_service.legs_for_entry(conn, entry_id))
    updated = get_edit_policy(owner["ledger_mode"]).correct(conn, entry_id, intent)
    if updated["id"] != entry_id:                    # STRICT mode replaced the entry: carry the link over
        bills.set_settlement_link(conn, updated["id"], entry["settles_entry_id"], entry["payment_group"])
        updated = repo.get_journal_entry(conn, updated["id"])
    return updated


def delete_settlement(conn, owner, entry_id) -> None:
    entry = _require_settlement_entry(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Settlement {entry_id} is already reversed.")
    get_edit_policy(owner["ledger_mode"]).delete(conn, entry_id)


def assign_settlement(conn, owner, entry_id, allocations) -> list[dict]:
    """Tie an unassigned payment to the bills it paid. The amounts must add up to the payment. One bill only
    sets the link; several replace the payment by one entry per bill (same date, account and note)."""
    entry = _require_settlement_entry(conn, entry_id)
    if entry["status"] != "POSTED":
        raise ConflictError(f"Settlement {entry_id} was reversed.")
    if entry["settles_entry_id"] is not None:
        raise ConflictError("This payment is already tied to a bill.")
    legs = ledger_service.legs_for_entry(conn, entry_id)
    due_leg = next(l for l in legs if repo.get_account(conn, l.account_id)["account_type"] == AccountType.DUE.value)
    real_leg = next(l for l in legs if l is not due_leg)
    due = repo.get_account(conn, due_leg.account_id)
    friend = repo.get_contact(conn, due["counterparty_id"])
    received = due_leg.side.value == "CREDIT"        # they paid you: it settles splits
    plan = _plan(conn, friend, due, entry["currency_code"], allocations)
    wanted = "SPLIT" if received else "FRONTED"
    if plan[0][0]["entry_type"] != wanted:
        raise ValidationError("This payment went " + ("to you, so it pays what the friend owed you."
                                                       if received else "to the friend, so it pays what you owed them."))
    total = sum(m.points for _, m in plan)
    if total != due_leg.amount.points:
        raise ValidationError(f"The amounts add up to {Money(total, entry['currency_code'])} but the payment is "
                              f"{due_leg.amount}.")
    group = uuid.uuid4().hex[:12]
    if len(plan) == 1:
        bills.set_settlement_link(conn, entry_id, plan[0][0]["id"], group)
        return [repo.get_journal_entry(conn, entry_id)]
    get_edit_policy(owner["ledger_mode"]).delete(conn, entry_id)
    account = repo.get_account(conn, real_leg.account_id)
    return _post_payment(conn, friend, due, account, plan, entry_date=entry["entry_date"], note=entry["memo"],
                         group=group)
