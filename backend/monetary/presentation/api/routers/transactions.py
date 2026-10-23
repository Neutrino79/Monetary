from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from monetary.application import flat_transactions as flat
from monetary.application import transaction_service
from monetary.config import API_PREFIX
from monetary.infrastructure import repositories as repo
from monetary.presentation.api.deps import get_current_owner, DB
from monetary.presentation.api.schemas.common import MessageOut, Page
from monetary.presentation.api.schemas.converters import money_out, transaction_out
from monetary.presentation.api.schemas.transactions import (
    AdjustmentCreate,
    EntryDetailOut,
    EntryOut,
    ExpenseCreate,
    IncomeCreate,
    PostingOut,
    RefundCreate,
    GroupTotalOut,
    TransactionCreate,
    TransactionGroupOut,
    TransactionGroupsOut,
    TransactionOut,
    TransactionPatch,
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
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
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
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
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
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
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
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    entry = transaction_service.record_adjustment(
        conn, owner, account_id=payload.account_id, amount_major=payload.amount,
        side=payload.side, description=payload.title, date_str=payload.date, note=payload.note,
    )
    return _entry_out(conn, entry)


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(
    payload: TransactionCreate,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """Create any kind of transaction from one flat body (see TransactionCreate)."""
    entry = flat.create(conn, owner, payload.model_dump())
    return transaction_out(flat.view_of(conn, owner, entry))


_GROUP_BY = "^(date|month|category|account|type)$"


@router.get("", response_model=Page[TransactionOut])
def list_transactions(
    account_id: int | None = Query(default=None, alias="accountId"),
    category_id: int | None = Query(default=None, alias="categoryId",
                                    description="Includes the category's subcategories"),
    friend_id: int | None = Query(default=None, alias="friendId"),
    refund_of_id: int | None = Query(default=None, alias="refundOfId", description="Refunds recorded against this entry"),
    types: list[str] | None = Query(default=None, alias="type", description="Repeatable"),
    search: str | None = Query(default=None, description="Matches description or memo"),
    status: str = Query(default="posted", pattern="^(posted|reversed|all)$"),
    date_from: str | None = Query(default=None, alias="dateFrom", description="'YYYY-MM-DD', inclusive"),
    date_to: str | None = Query(default=None, alias="dateTo", description="'YYYY-MM-DD', inclusive"),
    settlement_direction: str | None = Query(default=None, alias="settlementDirection", pattern="^(receive|pay)$",
                                             description="Narrows settlements only: money you received or paid"),
    sort: str = Query(default="date", pattern="^(date|amount|description)$"),
    direction: str = Query(default="desc", pattern="^(asc|desc)$"),
    group_by: str | None = Query(default=None, alias="groupBy", pattern=_GROUP_BY,
                                 description="Cluster rows by group (date, month, category, account, type); "
                                             "`sort`/`direction` then order rows inside each group"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    views, total = flat.list_views(
        conn, owner, account_id=account_id, category_id=category_id, friend_id=friend_id, refund_of_id=refund_of_id, types=types,
        search=search, status=status, date_from=date_from, date_to=date_to, sort=sort,
        direction=direction, limit=limit, offset=offset, group_by=group_by,
        settlement_direction=settlement_direction)
    return Page(items=[transaction_out(v) for v in views], total=total, limit=limit, offset=offset)


@router.get("/groups", response_model=TransactionGroupsOut)
def list_transaction_groups(
    group_by: str = Query(alias="groupBy", pattern=_GROUP_BY),
    account_id: int | None = Query(default=None, alias="accountId"),
    category_id: int | None = Query(default=None, alias="categoryId",
                                    description="Includes the category's subcategories"),
    friend_id: int | None = Query(default=None, alias="friendId"),
    types: list[str] | None = Query(default=None, alias="type", description="Repeatable"),
    search: str | None = Query(default=None, description="Matches description or memo"),
    status: str = Query(default="posted", pattern="^(posted|reversed|all)$"),
    date_from: str | None = Query(default=None, alias="dateFrom", description="'YYYY-MM-DD', inclusive"),
    date_to: str | None = Query(default=None, alias="dateTo", description="'YYYY-MM-DD', inclusive"),
    settlement_direction: str | None = Query(default=None, alias="settlementDirection", pattern="^(receive|pay)$",
                                             description="Narrows settlements only: money you received or paid"),
    direction: str = Query(default="desc", pattern="^(asc|desc)$", description="Order of date/month groups"),
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    """Header data for a grouped list: the same filters as `GET /transactions`, one entry per group with its
    count and money in/out per currency. Group order matches the list's row order."""
    groups = flat.group_summaries(
        conn, owner, group_by=group_by, direction=direction, account_id=account_id, category_id=category_id,
        friend_id=friend_id, types=types, search=search, status=status, date_from=date_from, date_to=date_to,
        settlement_direction=settlement_direction)
    return TransactionGroupsOut(group_by=group_by, groups=[
        TransactionGroupOut(key=g["key"], label=g["label"], count=g["count"], totals=[
            GroupTotalOut(currency=t["currency"], money_in=money_out(t["in_points"], t["currency"]),
                          money_out=money_out(t["out_points"], t["currency"]))
            for t in g["totals"]])
        for g in groups])


@router.get("/{entry_id}", response_model=TransactionOut)
def get_transaction(
    entry_id: int,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    return transaction_out(flat.get_view(conn, owner, entry_id))


@router.get("/{entry_id}/postings", response_model=EntryDetailOut)
def get_transaction_postings(
    entry_id: int,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """The raw double-entry view of a transaction (all postings)."""
    entry = transaction_service.get_entry_or_raise(conn, entry_id)
    return _entry_detail_out(conn, entry)


@router.patch("/{entry_id}", response_model=TransactionOut)
def edit_transaction(
    entry_id: int, payload: TransactionPatch,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """Edit any transaction. In STRICT mode the result is a *new* entry (the
    original is reversed); `correctionOf` links them."""
    fields = payload.model_dump(include=payload.model_fields_set - {"force", "remove_settlements"})
    entry = flat.update(conn, owner, entry_id, fields, force=payload.force,
                        remove_settlements=payload.remove_settlements)
    return transaction_out(flat.view_of(conn, owner, entry))


@router.delete("/{entry_id}", response_model=MessageOut)
def delete_transaction(
    entry_id: int,
    force: bool = Query(default=False),
    remove_settlements: bool = Query(default=False, alias="removeSettlements"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    flat.delete(conn, owner, entry_id, force=force, remove_settlements=remove_settlements)
    return MessageOut(detail=f"Transaction {entry_id} deleted (mode={owner['ledger_mode']}).")
