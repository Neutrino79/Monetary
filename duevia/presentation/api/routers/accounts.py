from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from duevia.config import API_PREFIX

from duevia.application import account_service
from duevia.presentation.api.deps import get_current_owner, get_db
from duevia.presentation.api.schemas.accounts import (
    AccountBalanceOut,
    AccountCreate,
    AccountOut,
    CategoryCreate,
    CategoryOut,
)
from duevia.presentation.api.schemas.converters import money_out

router = APIRouter(prefix=API_PREFIX, tags=["accounts"])


@router.post("/accounts", response_model=AccountOut, status_code=201)
def create_account(
    payload: AccountCreate,
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    acc = account_service.create_account(
        conn, name=payload.name, account_type=payload.type, currency_code=payload.currency
    )
    return AccountOut(**acc)


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(
    include_inactive: bool = Query(default=False),
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    return [AccountOut(**a) for a in account_service.list_accounts(conn, include_inactive=include_inactive)]


@router.get("/accounts/{account_id}/balance", response_model=AccountBalanceOut)
def get_account_balance(
    account_id: int,
    conn: sqlite3.Connection = Depends(get_db),
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
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    return AccountOut(**account_service.deactivate_account(conn, account_id))


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    currency = payload.currency or owner["home_currency_code"]
    cat = account_service.create_category(
        conn, name=payload.name, category_type=payload.type, parent_id=payload.parent_id,
        budget_limit_major=payload.budget_limit, currency_code=currency,
    )
    return CategoryOut(**cat)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    include_inactive: bool = Query(default=False),
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    return [CategoryOut(**c) for c in account_service.list_categories(conn, include_inactive=include_inactive)]


@router.post("/categories/{category_id}/deactivate", response_model=CategoryOut)
def deactivate_category(
    category_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    return CategoryOut(**account_service.deactivate_category(conn, category_id))
