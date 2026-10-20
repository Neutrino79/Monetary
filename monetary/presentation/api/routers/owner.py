from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from monetary.application import user_service
from monetary.config import API_PREFIX
from monetary.presentation.api.deps import get_current_owner, DB
from monetary.presentation.api.schemas.owner import OwnerOut, OwnerUpdateRequest

router = APIRouter(prefix=f"{API_PREFIX}/owner", tags=["owner"])


@router.get("", response_model=OwnerOut)
def get_owner(owner: dict = Depends(get_current_owner)):
    return OwnerOut(**owner)


@router.patch("", response_model=OwnerOut)
def update_owner(
    payload: OwnerUpdateRequest,
    conn: sqlite3.Connection = DB,
    owner: dict = Depends(get_current_owner),
):
    result = owner
    if payload.name is not None:
        result = user_service.rename_owner(conn, payload.name)
    if payload.timezone is not None:
        result = user_service.set_owner_timezone(conn, payload.timezone)
    if payload.ledger_mode is not None:
        result = user_service.set_ledger_mode(conn, payload.ledger_mode)
    return OwnerOut(**result)
