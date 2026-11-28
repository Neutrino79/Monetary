from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from monetary.application import match_service
from monetary.config import API_PREFIX
from monetary.presentation.api.deps import get_current_owner, DB
from monetary.presentation.api.schemas.common import MessageOut
from monetary.presentation.api.schemas.converters import match_out
from monetary.presentation.api.schemas.transactions import MatchCreate, MatchEdit, MatchOut

router = APIRouter(prefix=f"{API_PREFIX}/matches", tags=["matches"])


@router.post("", response_model=MatchOut, status_code=201)
def create_match(
    payload: MatchCreate,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """Set part of a bill you owe a friend against a bill they owe you. No money moves and their balance does
    not change; each bill just shows that much less left to settle. Matching the same pair again adds to it."""
    m = match_service.create_match(
        conn, owner, friend_id=payload.friend_id, owed_to_me_id=payload.owed_to_me_id,
        owed_by_me_id=payload.owed_by_me_id, amount_major=payload.amount)
    return match_out(m)


@router.patch("/{match_id}", response_model=MatchOut)
def edit_match(
    match_id: int, payload: MatchEdit,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """Change the matched amount. Locked (409) while a payment is tied to either bill, unless `removeLinked`."""
    return match_out(match_service.update_match(
        conn, owner, match_id, amount_major=payload.amount, remove_linked=payload.remove_linked))


@router.delete("/{match_id}", response_model=MessageOut)
def delete_match(
    match_id: int, remove_linked: bool = Query(default=False, alias="removeLinked"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    match_service.delete_match(conn, owner, match_id, remove_linked=remove_linked)
    return MessageOut(detail=f"Match {match_id} removed.")
