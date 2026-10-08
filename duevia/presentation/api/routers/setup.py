from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from duevia.application import seed_service, user_service
from duevia.config import API_PREFIX
from duevia.presentation.api.deps import get_db
from duevia.presentation.api.schemas.owner import (
    InitRequest,
    InitResponse,
    OwnerOut,
    SetupStatusOut,
)

router = APIRouter(prefix=f"{API_PREFIX}/setup", tags=["setup"])


@router.get("/status", response_model=SetupStatusOut)
def setup_status(conn: sqlite3.Connection = Depends(get_db)):
    """Public. Lets a client decide between the first-run setup screen and the
    sign-in screen. `POST /setup/init` re-checks atomically and answers 409 if
    an owner already exists, so this endpoint is a UX convenience, not a lock."""
    return SetupStatusOut(initialized=user_service.owner_exists(conn))


@router.post("/init", response_model=InitResponse, status_code=201)
def init(payload: InitRequest, conn: sqlite3.Connection = Depends(get_db)):
    owner = user_service.bootstrap_owner(
        conn, name=payload.name, email=payload.email, timezone=payload.timezone,
        home_currency_code=payload.currency, password=payload.password,
        security_question_id=payload.security_question_id, security_answer=payload.security_answer,
    )
    if payload.seed_defaults:
        # Same request transaction as the owner insert: a bad custom seed file
        # rolls the whole setup back instead of leaving a half-initialised instance.
        seed_service.seed_default_categories(conn, currency_code=owner["home_currency_code"])
    # auto-login so the very first caller doesn't need a separate /auth/login
    # round trip for a password they just set themselves
    _owner, token = user_service.login(conn, email=payload.email, password=payload.password)
    return InitResponse(owner=OwnerOut(**owner), access_token=token)
