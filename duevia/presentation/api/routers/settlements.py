from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from duevia.application import settlement_service
from duevia.config import API_PREFIX
from duevia.presentation.api.deps import get_current_owner, DB
from duevia.presentation.api.routers.transactions import _entry_out
from duevia.presentation.api.schemas.common import MessageOut
from duevia.presentation.api.schemas.transactions import EntryOut, SettlementCreate, SettlementEdit

router = APIRouter(prefix=f"{API_PREFIX}/settlements", tags=["settlements"])


@router.post("", response_model=EntryOut, status_code=201)
def create_settlement(
    payload: SettlementCreate,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    entry = settlement_service.create_settlement(
        conn, owner, friend_id=payload.friend_id, account_id=payload.account_id,
        amount_major=payload.amount, description=payload.description, date_str=payload.date,
        note=payload.note,
    )
    return _entry_out(conn, entry)


@router.patch("/{entry_id}", response_model=EntryOut)
def edit_settlement(
    entry_id: int, payload: SettlementEdit,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    entry = settlement_service.edit_settlement(
        conn, owner, entry_id, friend_id=payload.friend_id, account_id=payload.account_id,
        amount_major=payload.amount, description=payload.description, date_str=payload.date,
        note=payload.note,
    )
    return _entry_out(conn, entry)


@router.delete("/{entry_id}", response_model=MessageOut)
def delete_settlement(
    entry_id: int,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    settlement_service.delete_settlement(conn, owner, entry_id)
    return MessageOut(detail=f"Settlement {entry_id} deleted (mode={owner['ledger_mode']}).")


@router.get("", response_model=list[EntryOut])
def list_settlements(
    friend_id: int | None = Query(default=None),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    return [_entry_out(conn, e) for e in settlement_service.list_settlements(conn, friend_id=friend_id)]
