from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from monetary.application import bill_service, match_service, statement_service, transaction_view, user_service
from monetary.config import API_PREFIX
from monetary.domain.exceptions import ConflictError, NotFoundError
from monetary.domain.time_utils import utc_iso_to_local_date
from monetary.infrastructure import bill_repository as bills_repo
from monetary.infrastructure import repositories as repo
from monetary.presentation.api.deps import get_current_owner, DB
from monetary.presentation.api.schemas.common import MessageOut
from monetary.presentation.api.schemas.converters import (
    bill_out,
    friend_balance_out,
    match_out,
    money_out,
    transaction_out,
)
from monetary.presentation.api.schemas.transactions import BillOut, MatchOut, TransactionOut
from monetary.presentation.api.schemas.friends import (
    FriendBalanceOut,
    FriendCreate,
    FriendOut,
    FriendUpdate,
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
    return FriendOut(id=friend["id"], name=friend["name"], email=friend["email"],
                     phone=friend["phone"], due_account_id=due["id"], created_at=friend["created_at"])


@router.post("", response_model=FriendOut, status_code=201)
def add_friend(
    payload: FriendCreate,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    friend = user_service.add_friend(conn, name=payload.name, email=payload.email,
                                      currency_code=payload.currency, phone=payload.phone,
                                      own_email=owner["email"])
    return _friend_out(conn, friend)


@router.get("", response_model=list[FriendOut])
def list_friends(conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    return [_friend_out(conn, f) for f in user_service.list_friends(conn)]


@router.patch("/{friend_id}", response_model=FriendOut)
def update_friend(
    friend_id: int, payload: FriendUpdate,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    fields = payload.model_dump(include=payload.model_fields_set)
    friend = user_service.update_friend(conn, friend_id, fields=fields, own_email=owner["email"])
    return _friend_out(conn, friend)


@router.delete("/{friend_id}", response_model=MessageOut)
def delete_friend(
    friend_id: int,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    user_service.delete_friend(conn, friend_id)
    return MessageOut(detail=f"Friend {friend_id} deleted.")


@router.get("/balances", response_model=list[FriendBalanceOut])
def friend_balances(conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    rows = statement_service.friend_balances(conn)
    return [friend_balance_out(r) for r in rows]


@router.get("/{friend_id}/statement", response_model=list[StatementRowOut])
def friend_statement(
    friend_id: int,
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    friend = repo.get_contact(conn, friend_id)
    if friend is None:
        raise NotFoundError(f"Friend {friend_id} not found.")
    due = repo.get_due_account_for_friend(conn, friend_id)
    if due is None:
        return []
    rows = statement_service.friend_statement(conn, due["id"])
    return [StatementRowOut(
        entry_id=r["entry_id"], description=r["description"], entry_type=r["entry_type"],
        entry_date=r["entry_date"], date=utc_iso_to_local_date(r["entry_date"], owner["timezone"]),
        status=r["status"],
        delta=money_out(r["delta_points"], due["currency_code"]),
        running_balance=money_out(r["running_balance_points"], due["currency_code"]),
        settles_entry_id=r["settles_entry_id"], payment_group=r["payment_group"],
    ) for r in rows]


@router.get("/{friend_id}/bills", response_model=list[BillOut])
def friend_bills(
    friend_id: int, open: bool = Query(default=False, description="Only bills with something left"),
    conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """The splits this friend owes you and the expenses they paid for you, each with what is paid, matched and
    left. These are what a payment is made against."""
    return [bill_out(b) for b in bill_service.friend_bills(conn, owner, friend_id, only_open=open)]


@router.get("/{friend_id}/matches", response_model=list[MatchOut])
def friend_matches(
    friend_id: int, conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    return [match_out(m) for m in match_service.list_matches(conn, owner, friend_id)]


@router.get("/{friend_id}/unassigned-payments", response_model=list[TransactionOut])
def friend_unassigned_payments(
    friend_id: int, conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner),
):
    """Payments recorded before bills were settled one by one: not tied to any bill yet."""
    _friend, due = bill_service.require_friend(conn, friend_id)
    entries = [repo.get_journal_entry(conn, p["id"]) for p in bills_repo.unassigned_payments(conn, due["id"])]
    return [transaction_out(v) for v in transaction_view.to_views(conn, owner, entries)]
