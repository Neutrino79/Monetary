from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from monetary.application import flat_transactions as flat
from monetary.application import settlement_service
from monetary.config import API_PREFIX
from monetary.presentation.api.deps import get_current_owner, DB
from monetary.presentation.api.schemas.common import MessageOut
from monetary.presentation.api.schemas.converters import transaction_out
from monetary.presentation.api.schemas.transactions import (
    PaymentOut,
    SettlementAssign,
    SettlementCreate,
    SettlementEdit,
    TransactionOut,
)

router = APIRouter(prefix=f"{API_PREFIX}/settlements", tags=["settlements"])


def _payment_out(conn, owner: dict, entries: list[dict]) -> PaymentOut:
    return PaymentOut(payment_group=entries[0]["payment_group"] if entries else None,
                      transactions=[transaction_out(flat.view_of(conn, owner, e)) for e in entries])


@router.post("", response_model=PaymentOut, status_code=201)
def create_settlement(
    payload: SettlementCreate,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """Pay bills: money moving between you and a friend, for the bills you choose. One settlement entry is
    created per bill and they share a `paymentGroup`. All bills must be in one direction (what they owe you, or
    what you owe them); the direction and the cap on each amount come from the bill."""
    entries = settlement_service.create_settlement(
        conn, owner, friend_id=payload.friend_id, account_id=payload.account_id,
        allocations=[(a.bill_id, a.amount) for a in payload.allocations], date_str=payload.date,
        note=payload.note)
    return _payment_out(conn, owner, entries)


@router.post("/{entry_id}/assign", response_model=PaymentOut)
def assign_settlement(
    entry_id: int, payload: SettlementAssign,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """Tie a payment recorded before bills were settled one by one to the bills it paid. The amounts must add up
    to the payment. With several bills the payment is replaced by one entry per bill."""
    entries = settlement_service.assign_settlement(
        conn, owner, entry_id, [(a.bill_id, a.amount) for a in payload.allocations])
    return _payment_out(conn, owner, entries)


@router.patch("/{entry_id}", response_model=TransactionOut)
def edit_settlement(
    entry_id: int, payload: SettlementEdit,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """Only the note can change. To change anything else, delete the payment and record it again."""
    entry = settlement_service.edit_settlement(conn, owner, entry_id, note=payload.note)
    return transaction_out(flat.view_of(conn, owner, entry))


@router.delete("/{entry_id}", response_model=MessageOut)
def delete_settlement(
    entry_id: int,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    settlement_service.delete_settlement(conn, owner, entry_id)
    return MessageOut(detail=f"Settlement {entry_id} deleted (mode={owner['ledger_mode']}).")


@router.get("", response_model=list[TransactionOut])
def list_settlements(
    friend_id: int | None = Query(default=None),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    return [transaction_out(flat.view_of(conn, owner, e))
            for e in settlement_service.list_settlements(conn, friend_id=friend_id)]
