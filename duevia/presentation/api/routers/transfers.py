from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from duevia.application import transfer_service
from duevia.config import API_PREFIX
from duevia.presentation.api.deps import get_current_owner, DB
from duevia.presentation.api.routers.transactions import _entry_out
from duevia.presentation.api.schemas.common import MessageOut
from duevia.presentation.api.schemas.transactions import EntryOut, TransferCreate, TransferEdit

router = APIRouter(prefix=f"{API_PREFIX}/transfers", tags=["transfers"])


@router.post("", response_model=EntryOut, status_code=201)
def create_transfer(
    payload: TransferCreate,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    entry = transfer_service.create_transfer(
        conn, owner, from_account_id=payload.from_account_id, to_account_id=payload.to_account_id,
        amount_major=payload.amount, description=payload.description, date_str=payload.date,
    )
    return _entry_out(conn, entry)


@router.get("", response_model=list[EntryOut])
def list_transfers(conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    return [_entry_out(conn, e) for e in transfer_service.list_transfers(conn)]


@router.patch("/{entry_id}", response_model=EntryOut)
def edit_transfer(
    entry_id: int, payload: TransferEdit,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    entry = transfer_service.edit_transfer(
        conn, owner, entry_id, from_account_id=payload.from_account_id,
        to_account_id=payload.to_account_id, amount_major=payload.amount,
        description=payload.description, date_str=payload.date,
    )
    return _entry_out(conn, entry)


@router.delete("/{entry_id}", response_model=MessageOut)
def delete_transfer(
    entry_id: int,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    transfer_service.delete_transfer(conn, owner, entry_id)
    return MessageOut(detail=f"Transfer {entry_id} deleted (mode={owner['ledger_mode']}).")
