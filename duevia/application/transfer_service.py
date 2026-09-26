"""Transfer application service. A transfer is just a 2-leg entry between two
real accounts -- works identically for paying off a credit card as for moving
cash between two banks, thanks to the per-account-type normal_side convention.
"""

from __future__ import annotations

from duevia.application import ledger_service
from duevia.application.edit_policies import get_edit_policy
from duevia.application.posting_strategies import transfer as transfer_strategy
from duevia.domain.enums import AccountType, EntryType
from duevia.domain.exceptions import ConflictError, NotFoundError, ValidationError
from duevia.domain.money import Money
from duevia.domain.time_utils import parse_local_to_utc_iso, utc_now_iso
from duevia.infrastructure import repositories as repo


def _require_real_account(conn, account_id) -> dict:
    acc = repo.get_account(conn, account_id)
    if acc is None or acc["account_type"] not in (AccountType.ASSET.value, AccountType.LIABILITY.value):
        raise NotFoundError(f"Account {account_id} not found.")
    if not acc["is_active"]:
        raise ValidationError(f"Account {account_id} is inactive.")
    return acc


def _validate_transfer(conn, from_acc, to_acc, money, *, exclude_entry_id=None) -> None:
    if from_acc["id"] == to_acc["id"]:
        raise ValidationError("Source and destination accounts must be different.")
    if from_acc["currency_code"] != to_acc["currency_code"]:
        raise ValidationError(
            f"Currency mismatch: {from_acc['currency_code']} vs {to_acc['currency_code']} "
            "(cross-currency transfers aren't supported)."
        )
    if (from_acc["account_type"] == AccountType.LIABILITY.value
            and to_acc["account_type"] == AccountType.ASSET.value):
        raise ValidationError(
            "Transfers from a liability account to an asset account aren't allowed — "
            "drawing cash from a credit line isn't a plain transfer in this model."
        )
    if to_acc["account_type"] == AccountType.LIABILITY.value:
        outstanding = repo.account_balance_points(
            conn, to_acc["id"], AccountType.LIABILITY.normal_side.value
        )
        if exclude_entry_id is not None:
            # editing: this transfer's own existing effect on the liability is
            # about to be replaced, so exclude it from "already outstanding"
            # first, matching what the new amount would face on a fresh create
            old_legs = ledger_service.legs_for_entry(conn, exclude_entry_id)
            for leg in old_legs:
                if leg.account_id == to_acc["id"]:
                    outstanding += leg.amount.points  # undo this entry's prior paydown
        if outstanding <= 0:
            raise ValidationError(
                f"{to_acc['name']} has nothing owed on it — a transfer can't pay off a "
                "liability that isn't outstanding."
            )
        if money.points > outstanding:
            raise ValidationError(
                f"Transfer of {money} exceeds what's owed on {to_acc['name']} "
                f"({Money(outstanding, to_acc['currency_code'])}) — you can't overpay a "
                "liability via transfer."
            )


def create_transfer(conn, owner, *, from_account_id, to_account_id, amount_major,
                     description=None, date_str=None) -> dict:
    from_acc = _require_real_account(conn, from_account_id)
    to_acc = _require_real_account(conn, to_account_id)
    money = Money.from_major_units(amount_major, from_acc["currency_code"])
    _validate_transfer(conn, from_acc, to_acc, money)

    entry_date = parse_local_to_utc_iso(date_str, owner["timezone"]) if date_str else utc_now_iso()
    intent = transfer_strategy.build_transfer(
        from_account_id=from_account_id, to_account_id=to_account_id, amount=money,
        description=description or f"Transfer: {from_acc['name']} -> {to_acc['name']}",
        entry_date=entry_date,
    )
    return ledger_service.post(conn, intent)


def _require_transfer_entry(conn, entry_id) -> dict:
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        raise NotFoundError(f"Transfer {entry_id} not found.")
    if entry["entry_type"] != EntryType.TRANSFER.value:
        raise ValidationError(f"Entry {entry_id} is not a transfer.")
    return entry


def edit_transfer(conn, owner, entry_id, *, from_account_id=None, to_account_id=None,
                   amount_major=None, description=None, date_str=None) -> dict:
    entry = _require_transfer_entry(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Transfer {entry_id} has already been reversed/replaced.")

    legs = ledger_service.legs_for_entry(conn, entry_id)
    old_from = next(l for l in legs if l.side.value == "CREDIT")
    old_to = next(l for l in legs if l.side.value == "DEBIT")

    resolved_from_id = from_account_id or old_from.account_id
    resolved_to_id = to_account_id or old_to.account_id
    from_acc = _require_real_account(conn, resolved_from_id)
    to_acc = _require_real_account(conn, resolved_to_id)
    money = Money.from_major_units(amount_major, from_acc["currency_code"]) if amount_major else old_from.amount
    _validate_transfer(conn, from_acc, to_acc, money, exclude_entry_id=entry_id)

    entry_date = (parse_local_to_utc_iso(date_str, owner["timezone"]) if date_str
                  else entry["entry_date"])
    new_description = (description or entry["description"]).strip()

    new_intent = transfer_strategy.build_transfer(
        from_account_id=resolved_from_id, to_account_id=resolved_to_id, amount=money,
        description=new_description, entry_date=entry_date,
    )
    policy = get_edit_policy(owner["ledger_mode"])
    return policy.correct(conn, entry_id, new_intent)


def list_transfers(conn) -> list[dict]:
    return repo.list_journal_entries(conn, entry_types=[EntryType.TRANSFER.value])


def delete_transfer(conn, owner, entry_id) -> None:
    entry = _require_transfer_entry(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Transfer {entry_id} is already reversed.")
    policy = get_edit_policy(owner["ledger_mode"])
    policy.delete(conn, entry_id)
