from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from duevia.application import user_service
from duevia.config import API_PREFIX
from duevia.presentation.api.deps import get_db
from duevia.presentation.api.schemas.owner import InitRequest, InitResponse, OwnerOut

router = APIRouter(prefix=f"{API_PREFIX}/setup", tags=["setup"])


@router.post("/init", response_model=InitResponse, status_code=201)
def init(payload: InitRequest, conn: sqlite3.Connection = Depends(get_db)):
    owner = user_service.bootstrap_owner(
        conn, name=payload.name, email=payload.email, timezone=payload.timezone,
        home_currency_code=payload.currency, password=payload.password,
        security_question_id=payload.security_question_id, security_answer=payload.security_answer,
    )
    # auto-login so the very first caller doesn't need a separate /auth/login
    # round trip for a password they just set themselves
    _owner, token = user_service.login(conn, email=payload.email, password=payload.password)
    return InitResponse(owner=OwnerOut(**owner), access_token=token)
