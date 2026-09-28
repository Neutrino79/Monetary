from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from duevia.application import statement_service, user_service
from duevia.config import API_PREFIX
from duevia.domain.exceptions import ConflictError
from duevia.infrastructure import repositories as repo
from duevia.presentation.api.deps import get_current_owner, get_db
from duevia.presentation.api.schemas.common import MessageOut
from duevia.presentation.api.schemas.converters import money_out
from duevia.presentation.api.schemas.friends import (
    FriendBalanceOut,
    FriendCreate,
    FriendOut,
    FriendRename,
    StatementRowOut,
)

router = APIRouter(prefix=f"{API_PREFIX}/friends", tags=["friends"])


def _friend_out(conn, friend: dict) -> FriendOut:
    due = repo.get_due_account_for_friend(conn, friend["id"])
    if due is None:
        # Every friend gets a DUE account atomically at creation time (see
        # user_service.add_friend) -- reaching this means data has drifted
        # from that invariant. Surface it as a clear 409 instead of letting
        # response-model validation fail with an opaque 500.
        raise ConflictError(
            f"Friend {friend['id']} ({friend['name']}) has no DUE account; data integrity issue."
        )
    return FriendOut(id=friend["id"], name=friend["name"], email=friend["email"], due_account_id=due["id"])


@router.post("", response_model=FriendOut, status_code=201)
def add_friend(
    payload: FriendCreate,
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    friend = user_service.add_friend(conn, name=payload.name, email=payload.email,
                                      currency_code=payload.currency)
    return _friend_out(conn, friend)


@router.get("", response_model=list[FriendOut])
def list_friends(conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner)):
    return [_friend_out(conn, f) for f in user_service.list_friends(conn)]


@router.patch("/{friend_id}", response_model=FriendOut)
def rename_friend(
    friend_id: int, payload: FriendRename,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    friend = user_service.rename_friend(conn, friend_id, payload.name)
    return _friend_out(conn, friend)


@router.delete("/{friend_id}", response_model=MessageOut)
def delete_friend(
    friend_id: int,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    user_service.delete_friend(conn, friend_id)
    return MessageOut(detail=f"Friend {friend_id} deleted.")


@router.get("/balances", response_model=list[FriendBalanceOut])
def friend_balances(conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner)):
    rows = statement_service.friend_balances(conn)
    return [FriendBalanceOut(friend_id=r["friend_id"], friend_name=r["friend_name"],
                              balance=money_out(r["points"], r["currency"])) for r in rows]


@router.get("/{friend_id}/statement", response_model=list[StatementRowOut])
def friend_statement(
    friend_id: int,
    conn: sqlite3.Connection = Depends(get_db), owner: dict = Depends(get_current_owner),
):
    due = repo.get_due_account_for_friend(conn, friend_id)
    if due is None:
        return []
    rows = statement_service.friend_statement(conn, due["id"])
    return [StatementRowOut(
        entry_id=r["entry_id"], description=r["description"], entry_type=r["entry_type"],
        entry_date=r["entry_date"], status=r["status"],
        delta=money_out(r["delta_points"], due["currency_code"]),
        running_balance=money_out(r["running_balance_points"], due["currency_code"]),
    ) for r in rows]
