"""Account application service. Real accounts and categories are both `account`
rows (account_type ASSET/LIABILITY vs EXPENSE/INCOME) -- this service covers
both."""

from __future__ import annotations

import re

from duevia.domain.enums import AccountType, as_enum
from duevia.domain.exceptions import NotFoundError, ValidationError
from duevia.domain.money import Money
from duevia.domain.time_utils import utc_now_iso
from duevia.infrastructure import repositories as repo

_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_REAL_TYPES = (AccountType.ASSET.value, AccountType.LIABILITY.value)
_CATEGORY_TYPES = (AccountType.EXPENSE.value, AccountType.INCOME.value)


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

def create_account(conn, *, name, account_type, currency_code) -> dict:
    if not name or not name.strip():
        raise ValidationError("Account name is required.")
    atype = as_enum(AccountType, account_type)
    if atype.value not in _REAL_TYPES:
        raise ValidationError("account_type must be ASSET or LIABILITY.")
    currency = _validate_currency_code(currency_code)
    if repo.account_name_exists(conn, atype.value, name.strip()):
        raise ValidationError(f"An account named {name.strip()!r} already exists.")
    return repo.create_account(conn, name=name.strip(), account_type=atype.value,
                                currency_code=currency, now=utc_now_iso())


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

def create_category(conn, *, name, category_type, parent_id=None, budget_limit_major=None,
                     currency_code=None) -> dict:
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
        parent_account_id=parent_id, budget_limit=budget_limit_points, now=utc_now_iso(),
    )


def get_category_or_raise(conn, category_id) -> dict:
    cat = repo.get_account(conn, category_id)
    if cat is None or cat["account_type"] not in _CATEGORY_TYPES:
        raise NotFoundError(f"Category {category_id} not found.")
    return cat


def list_categories(conn, include_inactive=False) -> list[dict]:
    return repo.list_accounts(conn, account_types=_CATEGORY_TYPES, include_inactive=include_inactive)


def deactivate_category(conn, category_id) -> dict:
    cat = get_category_or_raise(conn, category_id)
    if repo.has_active_children(conn, category_id):
        raise ValidationError(f"Category {category_id} still has active subcategories; "
                               "deactivate them first.")
    return repo.deactivate_account(conn, category_id, utc_now_iso())
