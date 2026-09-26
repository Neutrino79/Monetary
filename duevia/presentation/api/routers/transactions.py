from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from duevia.application import transaction_service
from duevia.config import API_PREFIX
from duevia.domain.time_utils import parse_local_to_utc_iso
from duevia.infrastructure import repositories as repo
from duevia.presentation.api.deps import get_current_owner, get_db
from duevia.presentation.api.schemas.common import MessageOut, Page
from duevia.presentation.api.schemas.converters import money_out
from duevia.presentation.api.schemas.transactions import (
    AdjustmentCreate,
    EntryDetailOut,
    EntryOut,
    ExpenseCreate,
    IncomeCreate,
    PostingOut,
    RefundCreate,
    TransactionEdit,
)

router = APIRouter(prefix=f"{API_PREFIX}/transactions", tags=["transactions"])


def _entry_out(conn, entry: dict) -> EntryOut:
    postings = repo.postings_for_entry(conn, entry["id"])
    amount = max((p["debit_amount"] or p["credit_amount"]) for p in postings) if postings else 0
    return EntryOut(
        id=entry["id"], description=entry["description"], memo=entry["memo"],
        entry_type=entry["entry_type"], currency_code=entry["currency_code"],
        entry_date=entry["entry_date"], status=entry["status"], category_id=entry["category_id"],
        refund_of_id=entry["refund_of_id"], reversal_of_id=entry["reversal_of_id"],
        reversed_by_id=entry["reversed_by_id"], amount=money_out(amount, entry["currency_code"]),
    )


def _entry_detail_out(conn, entry: dict) -> EntryDetailOut:
    base = _entry_out(conn, entry)
    postings = repo.postings_for_entry(conn, entry["id"])
    posting_rows = []
    for p in postings:
        acc = repo.get_account(conn, p["account_id"])
        side = "DEBIT" if p["debit_amount"] > 0 else "CREDIT"
        amount = p["debit_amount"] or p["credit_amount"]
        posting_rows.append(PostingOut(
            account_id=acc["id"], account_name=acc["name"], account_type=acc["account_type"],
            side=side, amount=money_out(amount, entry["currency_code"]),
        ))
    return EntryDetailOut(**base.model_dump(), postings=posting_rows)


@router.post("/expense", response_model=EntryOut, status_code=201)
def record_expense(
    payload: ExpenseCreate,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entry = transaction_service.record_expense(
        conn, owner, account_id=payload.account_id, category_id=payload.category_id,
        amount_major=payload.amount, description=payload.title, date_str=payload.date,
        note=payload.note,
    )
    return _entry_out(conn, entry)


@router.post("/income", response_model=EntryOut, status_code=201)
def record_income(
    payload: IncomeCreate,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entry = transaction_service.record_income(
        conn, owner, account_id=payload.account_id, category_id=payload.category_id,
        amount_major=payload.amount, description=payload.title, date_str=payload.date,
        note=payload.note,
    )
    return _entry_out(conn, entry)


@router.post("/refund", response_model=EntryOut, status_code=201)
def record_refund(
    payload: RefundCreate,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entry = transaction_service.record_refund(
        conn, owner, for_entry_id=payload.for_entry_id, amount_major=payload.amount,
        account_id=payload.account_id, category_id=payload.category_id,
        description=payload.title, date_str=payload.date, note=payload.note,
    )
    return _entry_out(conn, entry)


@router.post("/adjustment", response_model=EntryOut, status_code=201)
def record_adjustment(
    payload: AdjustmentCreate,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entry = transaction_service.record_adjustment(
        conn, owner, account_id=payload.account_id, amount_major=payload.amount,
        side=payload.side, description=payload.title, date_str=payload.date, note=payload.note,
    )
    return _entry_out(conn, entry)


@router.get("/{entry_id}", response_model=EntryDetailOut)
def get_transaction(
    entry_id: int,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entry = transaction_service.get_entry_or_raise(conn, entry_id)
    return _entry_detail_out(conn, entry)


@router.patch("/{entry_id}", response_model=EntryOut)
def edit_transaction(
    entry_id: int, payload: TransactionEdit,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entry = transaction_service.edit_expense_or_income(
        conn, owner, entry_id, account_id=payload.account_id, category_id=payload.category_id,
        amount_major=payload.amount, description=payload.title, date_str=payload.date,
        note=payload.note,
    )
    return _entry_out(conn, entry)


@router.delete("/{entry_id}", response_model=MessageOut)
def delete_transaction(
    entry_id: int,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    transaction_service.delete_entry(conn, owner, entry_id)
    return MessageOut(detail=f"Entry {entry_id} deleted (mode={owner['ledger_mode']}).")


@router.get("", response_model=Page[EntryOut])
def list_transactions(
    account_id: int | None = None,
    category_id: int | None = None,
    search: str | None = Query(default=None, description="Matches description or memo"),
    include_reversed: bool = Query(default=False),
    date_from: str | None = Query(default=None, description="'YYYY-MM-DD', local time"),
    date_to: str | None = Query(default=None, description="'YYYY-MM-DD', local time"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    df = parse_local_to_utc_iso(date_from, owner["timezone"]) if date_from else None
    dt = parse_local_to_utc_iso(date_to, owner["timezone"]) if date_to else None
    filters = dict(account_id=account_id, category_id=category_id, search=search,
                    include_reversed=include_reversed, date_from=df, date_to=dt)
    entries = repo.list_journal_entries(conn, **filters, limit=limit, offset=offset)
    total = repo.count_journal_entries(conn, **filters)
    return Page(items=[_entry_out(conn, e) for e in entries], total=total, limit=limit, offset=offset)
