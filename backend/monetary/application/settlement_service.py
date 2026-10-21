"""Settlement application service. Works in both directions:
- friend owes owner (positive DUE balance): friend pays cash in
- owner owes friend (negative DUE balance): owner pays cash out
Which direction fires is entirely determined by the current sign of the running
balance -- there's still no share_id, no offset table, just "post real cash,
change the balance by that amount."

Default titles reference which specific entries a settlement is best-effort
covering, computed via a FIFO walk over history purely for a human-readable
label -- this never affects the math (which only ever cares about the current
running balance), so it can't reintroduce the per-share sync bugs from V1.
"""

from __future__ import annotations

from monetary.application import ledger_service
from monetary.application.edit_policies import get_edit_policy
from monetary.application.posting_strategies import settlement as settlement_strategy
from monetary.domain.enums import AccountType, EntryType
from monetary.domain.exceptions import ConflictError, NotFoundError, ValidationError
from monetary.domain.ledger import LedgerIntent
from monetary.domain.money import Money
from monetary.domain.time_utils import parse_local_to_utc_iso, utc_now_iso
from monetary.infrastructure import repositories as repo


def _require_real_account(conn, account_id) -> dict:
    acc = repo.get_account(conn, account_id)
    if acc is None or acc["account_type"] not in (AccountType.ASSET.value, AccountType.LIABILITY.value):
        raise NotFoundError(f"Account {account_id} not found.")
    if not acc["is_active"]:
        raise ValidationError(f"Account {account_id} is inactive.")
    return acc


def _require_friend(conn, friend_id) -> tuple[dict, dict]:
    friend = repo.get_user(conn, friend_id)
    if friend is None or friend["is_superuser"]:
        raise NotFoundError(f"Friend {friend_id} not found.")
    due = repo.get_due_account_for_friend(conn, friend_id)
    if due is None:
        raise ConflictError(f"Friend {friend_id} has no DUE account; this shouldn't happen.")
    return friend, due


def _fifo_coverage_label(conn, due_account_id, increase_column: str, new_amount_points: int) -> str:
    """Best-effort, display-only: walk the entries that increased this balance
    (oldest first), skip whatever's already been paid down, and list which ones
    this new amount would cover."""
    entries = repo.due_account_increase_entries(conn, due_account_id, increase_column)
    decrease_column = "credit_amount" if increase_column == "debit_amount" else "debit_amount"
    already_covered = repo.due_account_decrease_total(conn, due_account_id, decrease_column)

    remaining_to_skip = already_covered
    remaining_new = new_amount_points
    covered = []
    for e in entries:
        amt = e["amount"]
        if remaining_to_skip >= amt:
            remaining_to_skip -= amt
            continue
        available = amt - remaining_to_skip
        remaining_to_skip = 0
        take = min(available, remaining_new)
        if take > 0:
            covered.append(f"{e['description']} (#{e['id']})")
            remaining_new -= take
        if remaining_new <= 0:
            break
    return ", ".join(covered) if covered else None


def _build_settlement_intent(conn, friend, due, account, money, *, description, entry_date, note,
                              exclude_entry_id=None) -> LedgerIntent:
    current_balance = repo.account_balance_points(conn, due["id"], AccountType.DUE.normal_side.value)
    if exclude_entry_id is not None:
        # undo this entry's own prior effect first, so editing a settlement's amount
        # validates against what the balance would be without it -- same pattern used
        # by transfer_service.edit_transfer for the liability-overpay check
        for leg in ledger_service.legs_for_entry(conn, exclude_entry_id):
            if leg.account_id == due["id"]:
                delta = leg.amount.points if leg.side.value == "DEBIT" else -leg.amount.points
                current_balance -= delta

    if current_balance == 0:
        raise ConflictError(f"You and {friend['name']} are already settled up.")

    if current_balance > 0:
        if money.points > current_balance:
            raise ConflictError(
                f"Settlement of {money} exceeds what {friend['name']} owes "
                f"({Money(current_balance, account['currency_code'])})."
            )
        label = description or _fifo_coverage_label(conn, due["id"], "debit_amount", money.points)
        title = f"Settlement from {friend['name']}" + (f" — {label}" if label else "")
        return settlement_strategy.build_settlement(
            real_account_id=account["id"], friend_due_account_id=due["id"], amount=money,
            description=title, entry_date=entry_date, memo=note,
        )

    owed_by_owner = -current_balance
    if money.points > owed_by_owner:
        raise ConflictError(
            f"Payment of {money} exceeds what you owe {friend['name']} "
            f"({Money(owed_by_owner, account['currency_code'])})."
        )
    label = description or _fifo_coverage_label(conn, due["id"], "credit_amount", money.points)
    title = f"Payment to {friend['name']}" + (f" — {label}" if label else "")
    return settlement_strategy.build_repayment(
        real_account_id=account["id"], friend_due_account_id=due["id"], amount=money,
        description=title, entry_date=entry_date, memo=note,
    )


def create_settlement(conn, owner, *, friend_id, account_id, amount_major,
                       description=None, date_str=None, note=None) -> dict:
    friend, due = _require_friend(conn, friend_id)
    account = _require_real_account(conn, account_id)
    if account["currency_code"] != due["currency_code"]:
        raise ValidationError(
            f"Currency mismatch: account is {account['currency_code']}, "
            f"{friend['name']}'s balance is {due['currency_code']}."
        )
    money = Money.from_major_units(amount_major, account["currency_code"])
    entry_date = parse_local_to_utc_iso(date_str, owner["timezone"]) if date_str else utc_now_iso()
    intent = _build_settlement_intent(conn, friend, due, account, money, description=description,
                                       entry_date=entry_date, note=note)
    return ledger_service.post(conn, intent)


def list_settlements(conn, friend_id=None) -> list[dict]:
    if friend_id is None:
        return repo.list_journal_entries(conn, entry_types=[EntryType.SETTLEMENT.value])
    due = repo.get_due_account_for_friend(conn, friend_id)
    if due is None:
        return []
    return repo.list_journal_entries(
        conn, account_id=due["id"], entry_types=[EntryType.SETTLEMENT.value]
    )


def _require_settlement_entry(conn, entry_id) -> dict:
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        raise NotFoundError(f"Settlement {entry_id} not found.")
    if entry["entry_type"] != EntryType.SETTLEMENT.value:
        raise ValidationError(f"Entry {entry_id} is not a settlement.")
    return entry


def edit_settlement(conn, owner, entry_id, *, friend_id=None, account_id=None,
                     amount_major=None, description=None, date_str=None, note=None) -> dict:
    """Freely re-specify a settlement's friend, account, and/or amount. Direction
    (settlement-in vs payment-out) is re-resolved fresh against the balance with
    this entry's own prior effect excluded -- same as everything else, this is
    equivalent to recreating it, applied via the active edit policy."""
    entry = _require_settlement_entry(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Settlement {entry_id} has already been reversed/replaced.")

    legs = ledger_service.legs_for_entry(conn, entry_id)
    old_real_leg = next(l for l in legs if repo.get_account(conn, l.account_id)["account_type"]
                         in (AccountType.ASSET.value, AccountType.LIABILITY.value))
    old_due_leg = next(l for l in legs if repo.get_account(conn, l.account_id)["account_type"]
                        == AccountType.DUE.value)
    old_due_account = repo.get_account(conn, old_due_leg.account_id)
    old_friend_id = old_due_account["counterparty_user_id"]

    resolved_friend_id = friend_id if friend_id is not None else old_friend_id
    friend, due = _require_friend(conn, resolved_friend_id)
    resolved_account_id = account_id or old_real_leg.account_id
    account = _require_real_account(conn, resolved_account_id)
    if account["currency_code"] != due["currency_code"]:
        raise ValidationError(
            f"Currency mismatch: account is {account['currency_code']}, "
            f"{friend['name']}'s balance is {due['currency_code']}."
        )
    money = (Money.from_major_units(amount_major, account["currency_code"]) if amount_major
             else old_real_leg.amount)
    entry_date = (parse_local_to_utc_iso(date_str, owner["timezone"]) if date_str
                  else entry["entry_date"])
    new_note = note if note is not None else entry["memo"]

    # only exclude this entry's own prior effect if we're still editing the SAME
    # friend's balance -- if the friend changed, there's nothing to exclude on the
    # new friend's account, and the old friend's balance is unaffected by this edit
    exclude_id = entry_id if resolved_friend_id == old_friend_id else None
    new_intent = _build_settlement_intent(
        conn, friend, due, account, money, description=description, entry_date=entry_date,
        note=new_note, exclude_entry_id=exclude_id,
    )
    policy = get_edit_policy(owner["ledger_mode"])
    return policy.correct(conn, entry_id, new_intent)


def delete_settlement(conn, owner, entry_id) -> None:
    entry = _require_settlement_entry(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Settlement {entry_id} is already reversed.")
    policy = get_edit_policy(owner["ledger_mode"])
    policy.delete(conn, entry_id)
