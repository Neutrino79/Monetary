"""Transaction application service: validates inputs, resolves accounts, picks
the right posting strategy, and posts via ledger_service. Also owns editing
(mode-adaptive: STRICT reverses+recreates, DIRECT mutates in place -- see
application/edit_policies/) and deletion for simple (non-split, non-transfer)
entries. Split-specific and transfer-specific orchestration live in their own
sibling services since they have a meaningfully different leg shape.
"""

from __future__ import annotations

from duevia.application import ledger_service
from duevia.application.edit_policies import get_edit_policy
from duevia.application.posting_strategies import refund as refund_strategy
from duevia.application.posting_strategies import simple as simple_strategy
from duevia.domain.enums import AccountType, EntryType, Side, as_enum
from duevia.domain.exceptions import ConflictError, NotFoundError, ValidationError
from duevia.domain.money import Money
from duevia.domain.time_utils import parse_local_to_utc_iso, utc_now_iso
from duevia.infrastructure import repositories as repo


def _resolve_entry_date(date_str, owner_tz) -> str:
    return parse_local_to_utc_iso(date_str, owner_tz) if date_str else utc_now_iso()


def _require_real_account(conn, account_id, *, active=True) -> dict:
    acc = repo.get_account(conn, account_id)
    if acc is None or acc["account_type"] not in (AccountType.ASSET.value, AccountType.LIABILITY.value):
        raise NotFoundError(f"Account {account_id} not found.")
    if active and not acc["is_active"]:
        raise ValidationError(f"Account {account_id} is inactive.")
    return acc


def _require_category(conn, category_id, expected_type: AccountType, *, currency_to_match=None) -> dict:
    cat = repo.get_account(conn, category_id)
    if cat is None or cat["account_type"] not in (AccountType.EXPENSE.value, AccountType.INCOME.value):
        raise NotFoundError(f"Category {category_id} not found.")
    if not cat["is_active"]:
        raise ValidationError(f"Category {category_id} is inactive.")
    if cat["account_type"] != expected_type.value:
        raise ValidationError(
            f"Category {cat['name']} is {cat['account_type']}, expected {expected_type.value}."
        )
    if currency_to_match is not None and cat["currency_code"] != currency_to_match:
        raise ValidationError(
            f"Currency mismatch: account is {currency_to_match}, category "
            f"{cat['name']!r} is {cat['currency_code']}."
        )
    return cat


# --------------------------------------------------------------------------- #
# creation
# --------------------------------------------------------------------------- #

def record_expense(conn, owner, *, account_id, category_id, amount_major, description,
                    date_str=None, note=None) -> dict:
    account = _require_real_account(conn, account_id)
    _require_category(conn, category_id, AccountType.EXPENSE, currency_to_match=account["currency_code"])
    money = Money.from_major_units(amount_major, account["currency_code"])
    entry_date = _resolve_entry_date(date_str, owner["timezone"])
    intent = simple_strategy.build_expense(
        real_account_id=account_id, expense_account_id=category_id, amount=money,
        description=description.strip(), entry_date=entry_date, memo=note,
    )
    return ledger_service.post(conn, intent)


def record_income(conn, owner, *, account_id, category_id, amount_major, description,
                   date_str=None, note=None) -> dict:
    account = _require_real_account(conn, account_id)
    if account["account_type"] == AccountType.LIABILITY.value:
        raise ValidationError(
            "A liability account (e.g. a credit card) can't receive genuine income directly. "
            "Use 'transfer create' to pay it down from an asset account instead."
        )
    _require_category(conn, category_id, AccountType.INCOME, currency_to_match=account["currency_code"])
    money = Money.from_major_units(amount_major, account["currency_code"])
    entry_date = _resolve_entry_date(date_str, owner["timezone"])
    intent = simple_strategy.build_income(
        real_account_id=account_id, income_account_id=category_id, amount=money,
        description=description.strip(), entry_date=entry_date, memo=note,
    )
    return ledger_service.post(conn, intent)


def record_refund(conn, owner, *, for_entry_id, amount_major, account_id=None,
                   category_id=None, description=None, date_str=None, note=None) -> dict:
    original = repo.get_journal_entry(conn, for_entry_id)
    if original is None:
        raise NotFoundError(f"Journal entry {for_entry_id} not found.")
    if original["entry_type"] != EntryType.NORMAL.value:
        raise ValidationError(f"Entry {for_entry_id} is not a plain expense; can't refund it.")

    original_legs = ledger_service.legs_for_entry(conn, for_entry_id)
    original_real_leg = next(
        (l for l in original_legs if repo.get_account(conn, l.account_id)["account_type"]
         in (AccountType.ASSET.value, AccountType.LIABILITY.value)), None
    )
    if original_real_leg is None or original["category_id"] is None:
        raise ValidationError(f"Entry {for_entry_id} doesn't look like a refundable plain expense.")
    original_expense_leg_amount = next(
        l.amount for l in original_legs if l.account_id == original["category_id"]
    )

    resolved_account_id = account_id or original_real_leg.account_id
    resolved_category_id = category_id or original["category_id"]
    account = _require_real_account(conn, resolved_account_id)
    _require_category(conn, resolved_category_id, AccountType.EXPENSE,
                       currency_to_match=account["currency_code"])

    money = Money.from_major_units(amount_major, account["currency_code"])
    already_refunded = repo.refunded_total_points(conn, for_entry_id)
    original_amount = original_expense_leg_amount.points
    if already_refunded + money.points > original_amount:
        remaining = Money(original_amount - already_refunded, account["currency_code"])
        raise ConflictError(
            f"Refund of {money} exceeds the unrefunded remainder of entry {for_entry_id} "
            f"({remaining})."
        )

    entry_date = _resolve_entry_date(date_str, owner["timezone"])
    intent = refund_strategy.build_refund(
        real_account_id=resolved_account_id, expense_account_id=resolved_category_id,
        amount=money, description=description or f"Refund of #{for_entry_id}: {original['description']}",
        entry_date=entry_date, refund_of_id=for_entry_id, memo=note,
    )
    return ledger_service.post(conn, intent)


def record_adjustment(conn, owner, *, account_id, amount_major, side, description,
                       date_str=None, note=None) -> dict:
    account = _require_real_account(conn, account_id)
    equity = repo.get_system_account(conn, AccountType.EQUITY.value)
    if equity is None:
        raise ConflictError("No system Adjustments account found; this shouldn't happen.")
    money = Money.from_major_units(amount_major, account["currency_code"])
    resolved_side = as_enum(Side, side)
    entry_date = _resolve_entry_date(date_str, owner["timezone"])
    intent = simple_strategy.build_adjustment(
        real_account_id=account_id, equity_account_id=equity["id"], amount=money,
        side=resolved_side, description=description.strip(), entry_date=entry_date, memo=note,
    )
    return ledger_service.post(conn, intent)


# --------------------------------------------------------------------------- #
# read
# --------------------------------------------------------------------------- #

def get_entry_or_raise(conn, entry_id) -> dict:
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        raise NotFoundError(f"Journal entry {entry_id} not found.")
    return entry


def list_entries(conn, **filters) -> list[dict]:
    return repo.list_journal_entries(conn, **filters)


# --------------------------------------------------------------------------- #
# edit / delete (simple entries: NORMAL, REFUND, ADJUSTMENT)
# --------------------------------------------------------------------------- #

_SIMPLE_TYPES = (EntryType.NORMAL.value, EntryType.REFUND.value, EntryType.ADJUSTMENT.value)


def edit_expense_or_income(conn, owner, entry_id, *, account_id=None, category_id=None,
                            amount_major=None, description=None, date_str=None, note=None) -> dict:
    """Edits a simple 2-leg entry (NORMAL expense/income, REFUND, ADJUSTMENT).
    Behavior depends on the owner's ledger_mode: DIRECT mutates the entry in
    place (same id, no history); STRICT reverses the original and posts a fresh
    replacement. Every field is freely editable in either mode."""
    entry = get_entry_or_raise(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Entry {entry_id} has already been reversed/replaced.")
    if entry["entry_type"] not in _SIMPLE_TYPES:
        hint = ("'split edit'" if entry["entry_type"] in ("SPLIT", "FRONTED")
                else "'transfer edit'" if entry["entry_type"] == "TRANSFER"
                else "a dedicated command for that type (not yet supported)")
        raise ValidationError(f"Entry {entry_id} is a {entry['entry_type']} entry; use {hint}.")

    legs = ledger_service.legs_for_entry(conn, entry_id)
    if len(legs) != 2:
        raise ValidationError(f"Entry {entry_id} has {len(legs)} legs; expected a simple 2-leg entry.")
    real_leg = next(l for l in legs if repo.get_account(conn, l.account_id)["account_type"]
                     in (AccountType.ASSET.value, AccountType.LIABILITY.value))

    if entry["entry_type"] == EntryType.ADJUSTMENT.value:
        return _edit_adjustment(conn, owner, entry, real_leg, account_id=account_id,
                                 amount_major=amount_major, description=description,
                                 date_str=date_str, note=note)

    category_leg = next(l for l in legs if l.account_id == entry["category_id"])
    category_account = repo.get_account(conn, category_leg.account_id)
    is_expense = category_account["account_type"] == AccountType.EXPENSE.value

    resolved_account_id = account_id or real_leg.account_id
    resolved_category_id = category_id or entry["category_id"]
    account = _require_real_account(conn, resolved_account_id)
    _require_category(conn, resolved_category_id,
                       AccountType.EXPENSE if is_expense else AccountType.INCOME,
                       currency_to_match=account["currency_code"])
    money = Money.from_major_units(amount_major, account["currency_code"]) if amount_major else real_leg.amount
    entry_date = _resolve_entry_date(date_str, owner["timezone"]) if date_str else entry["entry_date"]
    new_description = (description or entry["description"]).strip()
    new_note = note if note is not None else entry["memo"]

    if entry["entry_type"] == EntryType.REFUND.value:
        already_refunded = repo.refunded_total_points(conn, entry["refund_of_id"]) - real_leg.amount.points
        original = repo.get_journal_entry(conn, entry["refund_of_id"])
        original_expense_amount = next(
            l.amount.points for l in ledger_service.legs_for_entry(conn, entry["refund_of_id"])
            if l.account_id == original["category_id"]
        )
        if already_refunded + money.points > original_expense_amount:
            remaining = Money(original_expense_amount - already_refunded, account["currency_code"])
            raise ConflictError(f"Refund of {money} exceeds the unrefunded remainder ({remaining}).")
        new_intent = refund_strategy.build_refund(
            real_account_id=resolved_account_id, expense_account_id=resolved_category_id,
            amount=money, description=new_description, entry_date=entry_date,
            refund_of_id=entry["refund_of_id"], memo=new_note,
        )
    else:
        build = simple_strategy.build_expense if is_expense else simple_strategy.build_income
        kwargs = dict(real_account_id=resolved_account_id, amount=money,
                      description=new_description, entry_date=entry_date, memo=new_note)
        kwargs["expense_account_id" if is_expense else "income_account_id"] = resolved_category_id
        new_intent = build(**kwargs)

    policy = get_edit_policy(owner["ledger_mode"])
    return policy.correct(conn, entry_id, new_intent)


def _edit_adjustment(conn, owner, entry, real_leg, *, account_id, amount_major, description,
                      date_str, note) -> dict:
    resolved_account_id = account_id or real_leg.account_id
    account = _require_real_account(conn, resolved_account_id)
    equity = repo.get_system_account(conn, AccountType.EQUITY.value)
    money = Money.from_major_units(amount_major, account["currency_code"]) if amount_major else real_leg.amount
    entry_date = _resolve_entry_date(date_str, owner["timezone"]) if date_str else entry["entry_date"]
    new_description = (description or entry["description"]).strip()
    new_note = note if note is not None else entry["memo"]
    new_intent = simple_strategy.build_adjustment(
        real_account_id=resolved_account_id, equity_account_id=equity["id"], amount=money,
        side=real_leg.side, description=new_description, entry_date=entry_date, memo=new_note,
    )
    policy = get_edit_policy(owner["ledger_mode"])
    return policy.correct(conn, entry["id"], new_intent)


def delete_entry(conn, owner, entry_id) -> None:
    entry = get_entry_or_raise(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Entry {entry_id} is already reversed.")
    if entry["entry_type"] not in _SIMPLE_TYPES:
        hint = ("'split delete'" if entry["entry_type"] in ("SPLIT", "FRONTED")
                else "'transfer delete'" if entry["entry_type"] == "TRANSFER"
                else "a dedicated command for that type (not yet supported)")
        raise ValidationError(f"Entry {entry_id} is a {entry['entry_type']} entry; use {hint}.")
    policy = get_edit_policy(owner["ledger_mode"])
    policy.delete(conn, entry_id)
