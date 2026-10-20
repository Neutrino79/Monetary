"""Account application service. Real accounts and categories are both `account`
rows (account_type ASSET/LIABILITY vs EXPENSE/INCOME) -- this service covers
both."""

from __future__ import annotations

import re

from monetary.domain.enums import AccountType, as_enum
from monetary.domain.exceptions import NotFoundError, ValidationError
from monetary.domain.money import Money
from monetary.domain.time_utils import utc_now_iso
from monetary.infrastructure import repositories as repo

_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_REAL_TYPES = (AccountType.ASSET.value, AccountType.LIABILITY.value)
_CATEGORY_TYPES = (AccountType.EXPENSE.value, AccountType.INCOME.value)
_SUBTYPES = {
    AccountType.ASSET.value: ("bank", "cash", "wallet"),
    AccountType.LIABILITY.value: ("credit_card",),
}
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validate_currency_code(currency_code: str) -> str:
    code = (currency_code or "").strip().upper()
    if not _CURRENCY_RE.match(code):
        raise ValidationError(
            f"Invalid currency code {currency_code!r}; expected a 3-letter ISO 4217 code, e.g. 'INR'."
        )
    return code


# --------------------------------------------------------------------------- #
# real accounts (ASSET / LIABILITY)
# --------------------------------------------------------------------------- #

def default_subtype(account_type: str) -> str:
    return "credit_card" if account_type == AccountType.LIABILITY.value else "bank"


def _validate_account_details(account_type: str, subtype, credit_limit_major, statement_day, currency):
    """Validate the optional descriptive fields; returns (subtype, credit_limit_points,
    statement_day). Credit limit and statement day only make sense for liabilities
    (credit cards / loans), so they are rejected on asset accounts."""
    if subtype is not None and subtype not in _SUBTYPES[account_type]:
        raise ValidationError(
            f"subtype {subtype!r} is not valid for a {account_type} account; "
            f"expected one of: {', '.join(_SUBTYPES[account_type])}."
        )
    limit_points = None
    if credit_limit_major not in (None, ""):
        if account_type != AccountType.LIABILITY.value:
            raise ValidationError("credit_limit is only allowed on LIABILITY accounts.")
        limit_points = Money.from_major_units(credit_limit_major, currency).points
        if limit_points <= 0:
            raise ValidationError("credit_limit must be greater than zero.")
    if statement_day is not None:
        if account_type != AccountType.LIABILITY.value:
            raise ValidationError("statement_day is only allowed on LIABILITY accounts.")
        if not 1 <= int(statement_day) <= 31:
            raise ValidationError("statement_day must be between 1 and 31.")
    return subtype, limit_points, statement_day


def create_account(conn, *, name, account_type, currency_code, subtype=None,
                    credit_limit_major=None, statement_day=None) -> dict:
    if not name or not name.strip():
        raise ValidationError("Account name is required.")
    atype = as_enum(AccountType, account_type)
    if atype.value not in _REAL_TYPES:
        raise ValidationError("account_type must be ASSET or LIABILITY.")
    currency = _validate_currency_code(currency_code)
    if repo.account_name_exists(conn, atype.value, name.strip()):
        raise ValidationError(f"An account named {name.strip()!r} already exists.")
    subtype, limit_points, statement_day = _validate_account_details(
        atype.value, subtype, credit_limit_major, statement_day, currency)
    return repo.create_account(conn, name=name.strip(), account_type=atype.value,
                                currency_code=currency, subtype=subtype, credit_limit=limit_points,
                                statement_day=statement_day, now=utc_now_iso())


def create_account_with_opening_balance(conn, owner, *, opening_balance_major=None, opening_date=None,
                                         **account_fields) -> dict:
    """Create an account and, when an opening balance is given, post it as an
    ADJUSTMENT against the system Adjustments account -- the ledger stays the
    single source of truth (no separate stored balance to drift). For an asset
    the opening balance is money held (debit); for a liability it is the
    amount already owed (credit). Negative opening balances are rejected."""
    from monetary.application import transaction_service  # local: avoids an import cycle

    account = create_account(conn, **account_fields)
    if opening_balance_major in (None, ""):
        return account
    money = Money.from_major_units(opening_balance_major, account["currency_code"])
    if money.points < 0:
        raise ValidationError("opening_balance cannot be negative.")
    if money.points > 0:
        side = "CREDIT" if account["account_type"] == AccountType.LIABILITY.value else "DEBIT"
        transaction_service.record_adjustment(
            conn, owner, account_id=account["id"], amount_major=opening_balance_major,
            side=side, description="Opening balance", date_str=opening_date,
        )
    return account


def update_account(conn, account_id, *, fields: dict) -> dict:
    """Partial update. `fields` holds only the keys the client sent (so an
    explicit null clears a clearable field, while an absent key is left alone)."""
    acc = get_real_account_or_raise(conn, account_id)
    name = acc["name"]
    if "name" in fields:
        new_name = (fields["name"] or "").strip()
        if not new_name:
            raise ValidationError("Account name is required.")
        if new_name.lower() != acc["name"].lower() and repo.account_name_exists(
                conn, acc["account_type"], new_name, exclude_id=account_id):
            raise ValidationError(f"An account named {new_name!r} already exists.")
        name = new_name
    subtype = fields["subtype"] if "subtype" in fields else acc["subtype"]
    statement_day = fields["statement_day"] if "statement_day" in fields else acc["statement_day"]
    if "credit_limit" in fields:
        _s, limit_points, _d = _validate_account_details(
            acc["account_type"], None, fields["credit_limit"], None, acc["currency_code"])
    else:
        limit_points = acc["credit_limit"]
    _validate_account_details(acc["account_type"], subtype, None, statement_day, acc["currency_code"])
    return repo.update_account_fields(
        conn, account_id, name=name, subtype=subtype, credit_limit=limit_points,
        statement_day=statement_day, color=acc["color"], budget_limit=acc["budget_limit"],
        parent_account_id=acc["parent_account_id"], now=utc_now_iso())


def reactivate_account(conn, account_id) -> dict:
    get_real_account_or_raise(conn, account_id)
    return repo.reactivate_account(conn, account_id, utc_now_iso())


def get_real_account_or_raise(conn, account_id) -> dict:
    acc = repo.get_account(conn, account_id)
    if acc is None or acc["account_type"] not in _REAL_TYPES:
        raise NotFoundError(f"Account {account_id} not found.")
    return acc


def list_accounts(conn, include_inactive=False) -> list[dict]:
    return repo.list_accounts(conn, account_types=_REAL_TYPES, include_inactive=include_inactive)


def deactivate_account(conn, account_id) -> dict:
    get_real_account_or_raise(conn, account_id)
    return repo.deactivate_account(conn, account_id, utc_now_iso())


def get_balance(conn, account_id) -> tuple[int, str]:
    """Returns (signed_points, currency_code). Use domain.money.format_signed()
    for display -- this is a computed balance, never a Money value."""
    acc = get_real_account_or_raise(conn, account_id)
    normal_side = AccountType(acc["account_type"]).normal_side.value
    points = repo.account_balance_points(conn, account_id, normal_side)
    return points, acc["currency_code"]


# --------------------------------------------------------------------------- #
# categories (EXPENSE / INCOME)
# --------------------------------------------------------------------------- #

def _validate_color(color):
    if color is not None and not _COLOR_RE.match(color):
        raise ValidationError("color must be a hex colour such as '#2f6f4f'.")
    return color.lower() if color else None


def create_category(conn, *, name, category_type, parent_id=None, budget_limit_major=None,
                     currency_code=None, color=None) -> dict:
    if not name or not name.strip():
        raise ValidationError("Category name is required.")
    ctype = as_enum(AccountType, category_type)
    if ctype.value not in _CATEGORY_TYPES:
        raise ValidationError("category_type must be EXPENSE or INCOME.")

    parent = None
    if parent_id is not None:
        parent = repo.get_account(conn, parent_id)
        if parent is None or parent["account_type"] not in _CATEGORY_TYPES:
            raise NotFoundError(f"Parent category {parent_id} not found.")
        if parent["parent_account_id"] is not None:
            raise ValidationError("Cannot nest a category under a category that is itself a "
                                   "child (only one level of hierarchy is supported).")
        if not parent["is_active"]:
            raise ValidationError(f"Parent category {parent['name']!r} is inactive.")
        if parent["account_type"] != ctype.value:
            raise ValidationError(
                f"Parent category {parent['name']!r} is {parent['account_type']}; "
                f"a {ctype.value} category cannot be nested under it."
            )

    if repo.account_name_exists(conn, ctype.value, name.strip()):
        raise ValidationError(f"A category named {name.strip()!r} already exists.")

    currency = _validate_currency_code(currency_code) if currency_code else None
    budget_limit_points = None
    if budget_limit_major is not None:
        if ctype != AccountType.EXPENSE:
            raise ValidationError("budget_limit is only allowed on EXPENSE categories.")
        if parent_id is not None:
            raise ValidationError("budget_limit is only allowed on root categories.")
        if not currency:
            raise ValidationError("currency is required when setting a budget_limit.")
        budget_limit_points = Money.from_major_units(budget_limit_major, currency).points

    if currency is None:
        raise ValidationError("currency is required when creating a category.")

    return repo.create_account(
        conn, name=name.strip(), account_type=ctype.value, currency_code=currency,
        parent_account_id=parent_id, budget_limit=budget_limit_points,
        color=_validate_color(color), now=utc_now_iso(),
    )


def get_category_or_raise(conn, category_id) -> dict:
    cat = repo.get_account(conn, category_id)
    if cat is None or cat["account_type"] not in _CATEGORY_TYPES:
        raise NotFoundError(f"Category {category_id} not found.")
    return cat


def list_categories(conn, include_inactive=False) -> list[dict]:
    return repo.list_accounts(conn, account_types=_CATEGORY_TYPES, include_inactive=include_inactive)


def deactivate_category(conn, category_id) -> dict:
    get_category_or_raise(conn, category_id)  # NotFoundError if it does not exist
    if repo.has_active_children(conn, category_id):
        raise ValidationError(f"Category {category_id} still has active subcategories; "
                               "deactivate them first.")
    return repo.deactivate_account(conn, category_id, utc_now_iso())


def update_category(conn, category_id, *, fields: dict) -> dict:
    """Partial update of name / colour / budget / parent. Keeps the same
    invariants as creation: one level of hierarchy, a child shares its parent's
    type, budgets only on root EXPENSE categories. A key present with null
    clears (colour, budget, parent -> root); an absent key is unchanged."""
    cat = get_category_or_raise(conn, category_id)
    name = cat["name"]
    if "name" in fields:
        new_name = (fields["name"] or "").strip()
        if not new_name:
            raise ValidationError("Category name is required.")
        if new_name.lower() != cat["name"].lower() and repo.account_name_exists(
                conn, cat["account_type"], new_name, exclude_id=category_id):
            raise ValidationError(f"A category named {new_name!r} already exists.")
        name = new_name
    color = _validate_color(fields["color"]) if "color" in fields else cat["color"]

    parent_id = cat["parent_account_id"]
    if "parent_id" in fields:
        new_parent = fields["parent_id"]
        if new_parent is not None:
            if new_parent == category_id:
                raise ValidationError("A category cannot be its own parent.")
            parent = repo.get_account(conn, new_parent)
            if parent is None or parent["account_type"] not in _CATEGORY_TYPES:
                raise NotFoundError(f"Parent category {new_parent} not found.")
            if parent["parent_account_id"] is not None:
                raise ValidationError("Cannot nest a category under a category that is itself a child.")
            if parent["account_type"] != cat["account_type"]:
                raise ValidationError(f"A {cat['account_type']} category cannot be nested under a "
                                       f"{parent['account_type']} category.")
            if not parent["is_active"]:
                raise ValidationError(f"Parent category {parent['name']!r} is inactive.")
            if repo.child_account_ids(conn, category_id):
                raise ValidationError("A category that has subcategories cannot become a subcategory.")
        parent_id = new_parent

    budget = cat["budget_limit"]
    if "budget_limit" in fields:
        raw = fields["budget_limit"]
        budget = None if raw in (None, "") else Money.from_major_units(raw, cat["currency_code"]).points
    if budget is not None:
        if cat["account_type"] != AccountType.EXPENSE.value:
            raise ValidationError("budget_limit is only allowed on EXPENSE categories.")
        if parent_id is not None:
            raise ValidationError("budget_limit is only allowed on root categories.")
    return repo.update_account_fields(
        conn, category_id, name=name, subtype=None, credit_limit=None, statement_day=None,
        color=color, budget_limit=budget, parent_account_id=parent_id, now=utc_now_iso())


def reactivate_category(conn, category_id) -> dict:
    cat = get_category_or_raise(conn, category_id)
    if cat["parent_account_id"] is not None:
        parent = repo.get_account(conn, cat["parent_account_id"])
        if parent is not None and not parent["is_active"]:
            raise ValidationError(f"Restore the parent category {parent['name']!r} first.")
    return repo.reactivate_account(conn, category_id, utc_now_iso())
