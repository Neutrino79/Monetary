"""Split application service: splitting an expense across the owner + one or
more friends (SPLIT), a friend fronting an expense entirely (FRONTED), and
editing/deleting either flavor freely via the active edit policy.

"Who was on this split and what's their share" is derived directly from the
entry's own postings -- the expense-account leg is the owner's share, each
DUE-account leg is a friend's share -- never from a separate table, so there's
nothing that can drift out of sync with reality (see split_composition()).

Editing/deleting a split whose participants have existing SETTLEMENT history is
guarded: by default it's refused with a clear explanation, and the caller must
pass either force=True (proceed, keep the settlement history as-is) or
remove_settlements=True (also remove those settlements first, via the current
edit policy, before applying the change).
"""

from __future__ import annotations

from monetary.application import ledger_service
from monetary.application.edit_policies import get_edit_policy
from monetary.application.posting_strategies import simple as simple_strategy
from monetary.application.posting_strategies import split as split_strategy
from monetary.domain.enums import AccountType, EntryType
from monetary.domain.exceptions import ConflictError, NotFoundError, ValidationError
from monetary.domain.money import Money
from monetary.domain.time_utils import parse_local_to_utc_iso, utc_now_iso
from monetary.infrastructure import repositories as repo

_SPLIT_TYPES = (EntryType.SPLIT.value, EntryType.FRONTED.value)


def _resolve_entry_date(date_str, owner_tz) -> str:
    return parse_local_to_utc_iso(date_str, owner_tz) if date_str else utc_now_iso()


def _require_real_account(conn, account_id) -> dict:
    acc = repo.get_account(conn, account_id)
    if acc is None or acc["account_type"] not in (AccountType.ASSET.value, AccountType.LIABILITY.value):
        raise NotFoundError(f"Account {account_id} not found.")
    if not acc["is_active"]:
        raise ValidationError(f"Account {account_id} is inactive.")
    return acc


def _require_expense_category(conn, category_id, *, currency_to_match=None) -> dict:
    cat = repo.get_account(conn, category_id)
    if cat is None or cat["account_type"] != AccountType.EXPENSE.value:
        raise NotFoundError(f"Expense category {category_id} not found.")
    if not cat["is_active"]:
        raise ValidationError(f"Category {category_id} is inactive.")
    if currency_to_match is not None and cat["currency_code"] != currency_to_match:
        raise ValidationError(
            f"Currency mismatch: account is {currency_to_match}, category "
            f"{cat['name']!r} is {cat['currency_code']}."
        )
    return cat


def _require_friend_due_account(conn, friend_id, *, currency_to_match=None) -> dict:
    friend = repo.get_contact(conn, friend_id)
    if friend is None:
        raise NotFoundError(f"Friend {friend_id} not found.")
    due = repo.get_due_account_for_friend(conn, friend_id)
    if due is None:
        raise ConflictError(f"Friend {friend_id} has no DUE account; this shouldn't happen.")
    if currency_to_match is not None and due["currency_code"] != currency_to_match:
        raise ValidationError(
            f"Currency mismatch: this split is in {currency_to_match}, but "
            f"{friend['name']}'s balance is tracked in {due['currency_code']}."
        )
    return due


def _resolve_friend_shares(conn, currency, shares: list[tuple[int, str]]) -> list[tuple[int, Money]]:
    seen = set()
    resolved = []
    for friend_id, amount_major in shares:
        if friend_id in seen:
            raise ValidationError(f"Friend {friend_id} appears more than once in the shares list.")
        seen.add(friend_id)
        due = _require_friend_due_account(conn, friend_id, currency_to_match=currency)
        money = Money.from_major_units(amount_major, currency)
        resolved.append((due["id"], money))
    return resolved


# --------------------------------------------------------------------------- #
# creation
# --------------------------------------------------------------------------- #

def create_split_expense(conn, owner, *, account_id, category_id, owner_share_major,
                          friend_shares: list[tuple[int, str]], description,
                          date_str=None, note=None) -> dict:
    account = _require_real_account(conn, account_id)
    _require_expense_category(conn, category_id, currency_to_match=account["currency_code"])
    currency = account["currency_code"]
    owner_share = Money.from_major_units(owner_share_major, currency, allow_zero=True)
    resolved_shares = _resolve_friend_shares(conn, currency, friend_shares)
    if not resolved_shares:
        raise ValidationError(
            "At least one friend share is required for a split — record a plain "
            "expense instead if nobody else is involved."
        )

    entry_date = _resolve_entry_date(date_str, owner["timezone"])
    intent = split_strategy.build_split_expense(
        real_account_id=account_id, expense_account_id=category_id, owner_share=owner_share,
        friend_shares=resolved_shares, description=description.strip(),
        entry_date=entry_date, memo=note,
    )
    return ledger_service.post(conn, intent)


def create_friend_fronted_expense(conn, owner, *, category_id, friend_id, amount_major,
                                   description, date_str=None, note=None) -> dict:
    cat = repo.get_account(conn, category_id)
    if cat is None or cat["account_type"] != AccountType.EXPENSE.value:
        raise NotFoundError(f"Expense category {category_id} not found.")
    due = _require_friend_due_account(conn, friend_id, currency_to_match=cat["currency_code"])
    _require_expense_category(conn, category_id)
    money = Money.from_major_units(amount_major, due["currency_code"])
    entry_date = _resolve_entry_date(date_str, owner["timezone"])
    intent = split_strategy.build_friend_fronted_expense(
        expense_account_id=category_id, friend_due_account_id=due["id"], amount=money,
        description=description.strip(), entry_date=entry_date, memo=note,
    )
    return ledger_service.post(conn, intent)


# --------------------------------------------------------------------------- #
# read
# --------------------------------------------------------------------------- #

def _require_split_entry(conn, entry_id) -> dict:
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        raise NotFoundError(f"Journal entry {entry_id} not found.")
    if entry["entry_type"] not in _SPLIT_TYPES:
        raise ValidationError(f"Entry {entry_id} is a {entry['entry_type']} entry, not a split.")
    return entry


def split_composition(conn, entry_id) -> dict:
    """Derives the full picture directly from postings: owner's share (from the
    expense-account leg, 0 if there wasn't one) and every friend's share (from
    each DUE-account leg) -- this is what makes 'GET /splits/{id}' able to
    display the owner's own share.

    Note: for a FRONTED entry, the category leg represents the *total* spend,
    all of it covered by the friend's payment -- the owner's own share is
    always 0 there, even though the category leg's amount is nonzero.
    """
    entry = _require_split_entry(conn, entry_id)
    legs = ledger_service.legs_for_entry(conn, entry_id)

    owner_share_points = 0
    if entry["entry_type"] == EntryType.SPLIT.value and entry["category_id"] is not None:
        cat_leg = next((l for l in legs if l.account_id == entry["category_id"]), None)
        if cat_leg is not None:
            owner_share_points = cat_leg.amount.points

    friends = []
    for leg in legs:
        acc = repo.get_account(conn, leg.account_id)
        if acc["account_type"] == AccountType.DUE.value:
            friend = repo.get_contact(conn, acc["counterparty_id"])
            friends.append({
                "friend_id": friend["id"] if friend else None,
                "friend_name": friend["name"] if friend else f"<removed friend, account #{leg.account_id}>",
                "due_account_id": leg.account_id,
                "amount": leg.amount,
            })

    return {
        "entry": entry,
        "owner_share": Money(owner_share_points, entry["currency_code"]),
        "friends": friends,
    }


def list_splits(conn, entry_type=None) -> list[dict]:
    types = [entry_type] if entry_type else list(_SPLIT_TYPES)
    return repo.list_journal_entries(conn, entry_types=types)


# --------------------------------------------------------------------------- #
# settlement-conflict guard (shared by edit and delete)
# --------------------------------------------------------------------------- #

def _friends_with_settlement_history(conn, due_account_ids: list[int]) -> list[tuple[dict, list[dict]]]:
    """[(friend_dict, [settlement_entries]), ...] for any of the given DUE
    accounts that have at least one POSTED settlement against them."""
    result = []
    for due_id in due_account_ids:
        settlements = repo.list_journal_entries(
            conn, account_id=due_id, entry_types=[EntryType.SETTLEMENT.value]
        )
        if settlements:
            due_account = repo.get_account(conn, due_id)
            friend = repo.get_contact(conn, due_account["counterparty_id"])
            result.append((friend, settlements))
    return result


def _check_settlement_conflicts(conn, owner, due_account_ids, *, force, remove_settlements) -> None:
    conflicts = _friends_with_settlement_history(conn, due_account_ids)
    if not conflicts:
        return
    if remove_settlements:
        policy = get_edit_policy(owner["ledger_mode"])
        for _friend, settlements in conflicts:
            for s in settlements:
                if s["status"] != "REVERSED":
                    policy.delete(conn, s["id"])
        return
    if force:
        return
    names = ", ".join(
        f"{friend['name']} ({len(settlements)} settlement(s))" for friend, settlements in conflicts
    )
    raise ConflictError(
        f"This split involves friends with existing settlement history: {names}. "
        "Pass force=true to edit/delete anyway (their balance will simply reflect the new "
        "numbers), or remove_settlements=true to also remove those settlements first."
    )


# --------------------------------------------------------------------------- #
# edit
# --------------------------------------------------------------------------- #

def edit_split(conn, owner, entry_id, *, account_id=None, category_id=None,
                owner_share_major=None, friend_shares: list[tuple[int, str]] | None = None,
                description=None, date_str=None, note=None,
                force=False, remove_settlements=False) -> dict:
    """Freely re-specify a SPLIT entry's account, category, owner share, and/or
    friend shares -- equivalent to recreating it from scratch, but updating the
    existing entry (STRICT mode: via reversal; DIRECT mode: in place)."""
    entry = _require_split_entry(conn, entry_id)
    if entry["entry_type"] != EntryType.SPLIT.value:
        raise ValidationError(f"Entry {entry_id} is FRONTED, not SPLIT; edit it via the fronted "
                               f"fields instead.")
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Entry {entry_id} has already been reversed/replaced.")

    composition = split_composition(conn, entry_id)
    old_due_ids = [f["due_account_id"] for f in composition["friends"]]
    _check_settlement_conflicts(conn, owner, old_due_ids, force=force, remove_settlements=remove_settlements)

    legs = ledger_service.legs_for_entry(conn, entry_id)
    real_leg = next(l for l in legs if repo.get_account(conn, l.account_id)["account_type"]
                     in (AccountType.ASSET.value, AccountType.LIABILITY.value))

    resolved_account_id = account_id or real_leg.account_id
    account = _require_real_account(conn, resolved_account_id)
    currency = account["currency_code"]
    resolved_category_id = category_id or entry["category_id"]
    _require_expense_category(conn, resolved_category_id, currency_to_match=currency)

    owner_share = (Money.from_major_units(owner_share_major, currency, allow_zero=True)
                   if owner_share_major is not None else composition["owner_share"])

    if friend_shares is None:
        shares_input = [(f["friend_id"], f["amount"].to_major_units_str()) for f in composition["friends"]]
    else:
        shares_input = friend_shares
    resolved_shares = _resolve_friend_shares(conn, currency, shares_input)
    if not resolved_shares:
        raise ValidationError("A split needs at least one friend share.")

    entry_date = _resolve_entry_date(date_str, owner["timezone"]) if date_str else entry["entry_date"]
    new_description = (description or entry["description"]).strip()
    new_note = note if note is not None else entry["memo"]

    new_intent = split_strategy.build_split_expense(
        real_account_id=resolved_account_id, expense_account_id=resolved_category_id,
        owner_share=owner_share, friend_shares=resolved_shares, description=new_description,
        entry_date=entry_date, memo=new_note,
    )
    policy = get_edit_policy(owner["ledger_mode"])
    return policy.correct(conn, entry_id, new_intent)


def edit_fronted_expense(conn, owner, entry_id, *, category_id=None, friend_id=None,
                          amount_major=None, description=None, date_str=None, note=None,
                          force=False, remove_settlements=False) -> dict:
    """Freely re-specify a FRONTED entry's category, which friend fronted it,
    and/or the amount."""
    entry = _require_split_entry(conn, entry_id)
    if entry["entry_type"] != EntryType.FRONTED.value:
        raise ValidationError(f"Entry {entry_id} is SPLIT, not FRONTED; edit it via the split "
                               f"account/owner-share/friend-shares fields instead.")
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Entry {entry_id} has already been reversed/replaced.")

    composition = split_composition(conn, entry_id)
    old_due_ids = [f["due_account_id"] for f in composition["friends"]]
    _check_settlement_conflicts(conn, owner, old_due_ids, force=force, remove_settlements=remove_settlements)

    current_friend_id = composition["friends"][0]["friend_id"]
    resolved_category_id = category_id or entry["category_id"]
    cat = repo.get_account(conn, resolved_category_id)
    if cat is None or cat["account_type"] != AccountType.EXPENSE.value:
        raise NotFoundError(f"Expense category {resolved_category_id} not found.")
    currency = cat["currency_code"]

    resolved_friend_id = friend_id if friend_id is not None else current_friend_id
    due = _require_friend_due_account(conn, resolved_friend_id, currency_to_match=currency)
    money = (Money.from_major_units(amount_major, currency) if amount_major
             else composition["friends"][0]["amount"])

    entry_date = _resolve_entry_date(date_str, owner["timezone"]) if date_str else entry["entry_date"]
    new_description = (description or entry["description"]).strip()
    new_note = note if note is not None else entry["memo"]

    new_intent = split_strategy.build_friend_fronted_expense(
        expense_account_id=resolved_category_id, friend_due_account_id=due["id"], amount=money,
        description=new_description, entry_date=entry_date, memo=new_note,
    )
    policy = get_edit_policy(owner["ledger_mode"])
    return policy.correct(conn, entry_id, new_intent)


def convert_expense_to_split(conn, owner, entry_id, *, account_id=None, category_id=None,
                              total_major=None, owner_share_major, friend_shares: list[tuple[int, str]],
                              description=None, date_str=None, note=None) -> dict:
    """Turn an existing plain expense into a split with friends. The bill, account
    and category carry over (any of them may be changed in the same edit); only
    your share stays as spend and each friend's share becomes money they owe you."""
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        raise NotFoundError(f"Entry {entry_id} not found.")
    if entry["entry_type"] != EntryType.NORMAL.value or entry["category_id"] is None:
        raise ValidationError(f"Entry {entry_id} isn't a plain expense, so it can't be split.")
    category = repo.get_account(conn, entry["category_id"])
    if category["account_type"] != AccountType.EXPENSE.value:
        raise ValidationError("Only an expense can be split with friends; income can't.")
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Entry {entry_id} has already been reversed/replaced.")
    if repo.refunded_total_points(conn, entry_id) > 0:
        raise ConflictError("This expense has refunds against it. Delete the refund(s) before splitting it.")

    legs = ledger_service.legs_for_entry(conn, entry_id)
    real_leg = next(l for l in legs if repo.get_account(conn, l.account_id)["account_type"]
                     in (AccountType.ASSET.value, AccountType.LIABILITY.value))
    resolved_account_id = account_id or real_leg.account_id
    account = _require_real_account(conn, resolved_account_id)
    currency = account["currency_code"]
    resolved_category_id = category_id or entry["category_id"]
    _require_expense_category(conn, resolved_category_id, currency_to_match=currency)

    owner_share = Money.from_major_units(owner_share_major, currency, allow_zero=True)
    resolved_shares = _resolve_friend_shares(conn, currency, friend_shares)
    if not resolved_shares:
        raise ValidationError("A split needs at least one friend share.")
    entry_date = _resolve_entry_date(date_str, owner["timezone"]) if date_str else entry["entry_date"]
    new_intent = split_strategy.build_split_expense(
        real_account_id=resolved_account_id, expense_account_id=resolved_category_id,
        owner_share=owner_share, friend_shares=resolved_shares,
        description=(description or entry["description"]).strip(), entry_date=entry_date,
        memo=note if note is not None else entry["memo"],
    )
    return get_edit_policy(owner["ledger_mode"]).correct(conn, entry_id, new_intent)


def convert_split_to_expense(conn, owner, entry_id, *, account_id=None, category_id=None,
                              amount_major=None, description=None, date_str=None, note=None,
                              force=False, remove_settlements=False) -> dict:
    """Undo a split: the entry becomes a plain expense for the whole bill and the friends' shares
    stop being owed. Guarded like any split edit when those friends already settled."""
    entry = _require_split_entry(conn, entry_id)
    if entry["entry_type"] != EntryType.SPLIT.value:
        raise ValidationError(f"Entry {entry_id} isn't a split.")
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Entry {entry_id} has already been reversed/replaced.")
    composition = split_composition(conn, entry_id)
    _check_settlement_conflicts(conn, owner, [f["due_account_id"] for f in composition["friends"]],
                                force=force, remove_settlements=remove_settlements)
    legs = ledger_service.legs_for_entry(conn, entry_id)
    real_leg = next(l for l in legs if repo.get_account(conn, l.account_id)["account_type"]
                     in (AccountType.ASSET.value, AccountType.LIABILITY.value))
    resolved_account_id = account_id or real_leg.account_id
    account = _require_real_account(conn, resolved_account_id)
    currency = account["currency_code"]
    resolved_category_id = category_id or entry["category_id"]
    _require_expense_category(conn, resolved_category_id, currency_to_match=currency)
    money = Money.from_major_units(amount_major, currency) if amount_major else real_leg.amount
    entry_date = _resolve_entry_date(date_str, owner["timezone"]) if date_str else entry["entry_date"]
    new_intent = simple_strategy.build_expense(
        real_account_id=resolved_account_id, expense_account_id=resolved_category_id, amount=money,
        description=(description or entry["description"]).strip(), entry_date=entry_date,
        memo=note if note is not None else entry["memo"],
    )
    return get_edit_policy(owner["ledger_mode"]).correct(conn, entry_id, new_intent)


def edit(conn, owner, entry_id, **kwargs) -> dict:
    """Dispatches to edit_split or edit_fronted_expense based on the entry's
    actual type, so a single API endpoint can accept either shape."""
    entry = _require_split_entry(conn, entry_id)
    if entry["entry_type"] == EntryType.SPLIT.value:
        return edit_split(conn, owner, entry_id, **kwargs)
    return edit_fronted_expense(conn, owner, entry_id, **kwargs)


# --------------------------------------------------------------------------- #
# delete
# --------------------------------------------------------------------------- #

def delete_split(conn, owner, entry_id, *, force=False, remove_settlements=False) -> None:
    entry = _require_split_entry(conn, entry_id)
    if entry["status"] == "REVERSED":
        raise ConflictError(f"Entry {entry_id} is already reversed.")
    composition = split_composition(conn, entry_id)
    due_ids = [f["due_account_id"] for f in composition["friends"]]
    _check_settlement_conflicts(conn, owner, due_ids, force=force, remove_settlements=remove_settlements)
    policy = get_edit_policy(owner["ledger_mode"])
    policy.delete(conn, entry_id)
