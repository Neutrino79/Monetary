from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from monetary.application import account_service
from monetary.config import API_PREFIX
from monetary.presentation.api.deps import get_current_owner, DB
from monetary.presentation.api.schemas.accounts import (
    AccountBalanceOut,
    AccountCreate,
    AccountOut,
    AccountUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
)
from monetary.presentation.api.schemas.converters import money_out

router = APIRouter(prefix=API_PREFIX, tags=["accounts"])


def account_out(conn, acc: dict) -> AccountOut:
    points, currency = account_service.get_balance(conn, acc["id"])
    limit = acc["credit_limit"]
    return AccountOut(
        id=acc["id"], name=acc["name"], account_type=acc["account_type"],
        currency_code=acc["currency_code"], is_active=bool(acc["is_active"]),
        subtype=acc["subtype"] or account_service.default_subtype(acc["account_type"]),
        credit_limit=money_out(limit, currency) if limit is not None else None,
        statement_day=acc["statement_day"], balance=money_out(points, currency),
        created_at=acc["created_at"], updated_at=acc["updated_at"],
    )


def category_out(cat: dict) -> CategoryOut:
    budget = cat["budget_limit"]
    return CategoryOut(
        id=cat["id"], name=cat["name"], account_type=cat["account_type"],
        currency_code=cat["currency_code"], parent_id=cat["parent_account_id"],
        budget_limit=money_out(budget, cat["currency_code"]) if budget is not None else None,
        color=cat["color"], is_active=bool(cat["is_active"]),
        created_at=cat["created_at"], updated_at=cat["updated_at"],
    )


@router.post("/accounts", response_model=AccountOut, status_code=201)
def create_account(
    payload: AccountCreate,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    acc = account_service.create_account_with_opening_balance(
        conn, owner, name=payload.name, account_type=payload.type, currency_code=payload.currency,
        subtype=payload.subtype, credit_limit_major=payload.credit_limit,
        statement_day=payload.statement_day, opening_balance_major=payload.opening_balance,
        opening_date=payload.opening_date,
    )
    return account_out(conn, acc)


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    return [account_out(conn, a) for a in account_service.list_accounts(conn, include_inactive=include_inactive)]


@router.patch("/accounts/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int, payload: AccountUpdate,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    fields = payload.model_dump(include=payload.model_fields_set)
    return account_out(conn, account_service.update_account(conn, account_id, fields=fields))


@router.get("/accounts/{account_id}/balance", response_model=AccountBalanceOut)
def get_account_balance(
    account_id: int,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    acc = account_service.get_real_account_or_raise(conn, account_id)
    points, currency = account_service.get_balance(conn, account_id)
    return AccountBalanceOut(
        account_id=acc["id"], name=acc["name"], account_type=acc["account_type"],
        balance=money_out(points, currency),
    )


@router.post("/accounts/{account_id}/deactivate", response_model=AccountOut)
def deactivate_account(
    account_id: int,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    return account_out(conn, account_service.deactivate_account(conn, account_id))


@router.post("/accounts/{account_id}/reactivate", response_model=AccountOut)
def reactivate_account(
    account_id: int,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    return account_out(conn, account_service.reactivate_account(conn, account_id))


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    currency = payload.currency or owner["home_currency_code"]
    cat = account_service.create_category(
        conn, name=payload.name, category_type=payload.type, parent_id=payload.parent_id,
        budget_limit_major=payload.budget_limit, currency_code=currency, color=payload.color,
    )
    return category_out(cat)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    type: str | None = Query(default=None, pattern="^(EXPENSE|INCOME)$",
                             description="Filter to EXPENSE categories or INCOME sources"),
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    cats = account_service.list_categories(conn, include_inactive=include_inactive)
    return [category_out(c) for c in cats if type is None or c["account_type"] == type]


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int, payload: CategoryUpdate,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    fields = payload.model_dump(include=payload.model_fields_set)
    return category_out(account_service.update_category(conn, category_id, fields=fields))


@router.post("/categories/{category_id}/deactivate", response_model=CategoryOut)
def deactivate_category(
    category_id: int,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    return category_out(account_service.deactivate_category(conn, category_id))


@router.post("/categories/{category_id}/reactivate", response_model=CategoryOut)
def reactivate_category(
    category_id: int,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    return category_out(account_service.reactivate_category(conn, category_id))
