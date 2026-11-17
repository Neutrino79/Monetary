from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from monetary.application import identity_service, user_service
from monetary.config import API_PREFIX
from monetary.presentation.api.deps import CONTROL, DB, get_current_account, get_current_owner
from monetary.presentation.api.schemas.owner import OwnerOut, OwnerUpdateRequest

router = APIRouter(prefix=f"{API_PREFIX}/owner", tags=["owner"])


@router.get("", response_model=OwnerOut)
def get_owner(owner: dict = Depends(get_current_owner)):
    return OwnerOut(**owner)


@router.patch("", response_model=OwnerOut)
def update_owner(
    payload: OwnerUpdateRequest,
    conn: sqlite3.Connection = DB,
    control: sqlite3.Connection = CONTROL,
    owner: dict = Depends(get_current_owner),
    account: dict = Depends(get_current_account),
):
    result = owner
    if payload.name is not None:
        result = user_service.rename_owner(conn, payload.name)
        identity_service.update_profile(control, account["id"], name=result["name"])
    if payload.timezone is not None:
        result = user_service.set_owner_timezone(conn, payload.timezone)
        identity_service.update_profile(control, account["id"], timezone=payload.timezone)
    if payload.ledger_mode is not None:
        result = user_service.set_ledger_mode(conn, payload.ledger_mode)
    return OwnerOut(**{**result, "security_question_id": owner["security_question_id"]})
