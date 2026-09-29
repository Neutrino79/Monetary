from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from duevia.application import split_service
from duevia.config import API_PREFIX
from duevia.domain.exceptions import NotFoundError
from duevia.infrastructure import repositories as repo
from duevia.presentation.api.deps import get_current_owner, get_db
from duevia.presentation.api.routers.transactions import _entry_out
from duevia.presentation.api.schemas.common import MessageOut
from duevia.presentation.api.schemas.converters import money_value_out
from duevia.presentation.api.schemas.transactions import (
    FrontedCreate,
    SplitCompositionOut,
    SplitCreate,
    SplitEdit,
    SplitParticipantOut,
)

router = APIRouter(prefix=f"{API_PREFIX}/splits", tags=["splits"])


def _composition_out(conn, comp: dict) -> SplitCompositionOut:
    participants = []
    if comp["owner_share"].points > 0:
        participants.append(SplitParticipantOut(
            friend_id=None, friend_name="(you)", share=money_value_out(comp["owner_share"]), is_owner=True
        ))
    for f in comp["friends"]:
        participants.append(SplitParticipantOut(
            friend_id=f["friend_id"], friend_name=f["friend_name"],
            share=money_value_out(f["amount"]), is_owner=False,
        ))
    return SplitCompositionOut(entry=_entry_out(conn, comp["entry"]), participants=participants)


@router.post("", response_model=SplitCompositionOut, status_code=201)
def create_split(
    payload: SplitCreate,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    friend_shares = [(s.friend_id, s.amount) for s in payload.friend_shares]
    entry = split_service.create_split_expense(
        conn, owner, account_id=payload.account_id, category_id=payload.category_id,
        owner_share_major=payload.owner_share, friend_shares=friend_shares,
        description=payload.title, date_str=payload.date, note=payload.note,
    )
    comp = split_service.split_composition(conn, entry["id"])
    return _composition_out(conn, comp)


@router.post("/fronted", response_model=SplitCompositionOut, status_code=201)
def create_fronted(
    payload: FrontedCreate,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entry = split_service.create_friend_fronted_expense(
        conn, owner, category_id=payload.category_id, friend_id=payload.friend_id,
        amount_major=payload.amount, description=payload.title, date_str=payload.date,
        note=payload.note,
    )
    comp = split_service.split_composition(conn, entry["id"])
    return _composition_out(conn, comp)


@router.get("/{entry_id}", response_model=SplitCompositionOut)
def get_split(
    entry_id: int,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    comp = split_service.split_composition(conn, entry_id)
    return _composition_out(conn, comp)


@router.patch("/{entry_id}", response_model=SplitCompositionOut)
def edit_split(
    entry_id: int, payload: SplitEdit,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None:
        raise NotFoundError(f"Journal entry {entry_id} not found.")
    friend_shares = ([(s.friend_id, s.amount) for s in payload.friend_shares]
                      if payload.friend_shares is not None else None)
    if entry["entry_type"] == "SPLIT":
        split_service.edit_split(
            conn, owner, entry_id, account_id=payload.account_id, category_id=payload.category_id,
            owner_share_major=payload.owner_share, friend_shares=friend_shares,
            description=payload.title, date_str=payload.date, note=payload.note,
            force=payload.force, remove_settlements=payload.remove_settlements,
        )
    else:
        split_service.edit_fronted_expense(
            conn, owner, entry_id, category_id=payload.category_id, friend_id=payload.friend_id,
            amount_major=payload.amount, description=payload.title, date_str=payload.date,
            note=payload.note, force=payload.force, remove_settlements=payload.remove_settlements,
        )
    comp = split_service.split_composition(conn, entry_id)
    return _composition_out(conn, comp)


@router.delete("/{entry_id}", response_model=MessageOut)
def delete_split(
    entry_id: int,
    force: bool = Query(default=False),
    remove_settlements: bool = Query(default=False),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    split_service.delete_split(conn, owner, entry_id, force=force, remove_settlements=remove_settlements)
    return MessageOut(detail=f"Split {entry_id} deleted (mode={owner['ledger_mode']}).")


@router.get("", response_model=list[dict])
def list_splits(
    type: str | None = Query(default=None, pattern="^(SPLIT|FRONTED)$"),
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    entries = split_service.list_splits(conn, entry_type=type)
    return [dict(_entry_out(conn, e)) for e in entries]
