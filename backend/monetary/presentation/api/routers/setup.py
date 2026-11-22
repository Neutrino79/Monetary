from __future__ import annotations

import sqlite3

from fastapi import APIRouter

from monetary.application import identity_service, provisioning
from monetary.config import API_PREFIX, data_dir_from_environment
from monetary.presentation.api.deps import CONTROL, owner_view
from monetary.presentation.api.schemas.owner import (
    InitRequest,
    InitResponse,
    OwnerOut,
    SetupStatusOut,
)

router = APIRouter(prefix=f"{API_PREFIX}/setup", tags=["setup"])


@router.get("/status", response_model=SetupStatusOut)
def setup_status(control: sqlite3.Connection = CONTROL):
    """Public. Lets a client decide between the first-run setup screen and the sign-in screen.
    `POST /setup/init` re-checks atomically and answers 409 once any account exists, so this endpoint
    is a UX convenience, not a lock."""
    return SetupStatusOut(initialized=identity_service.users_exist(control))


@router.post("/init", response_model=InitResponse, status_code=201)
def init(payload: InitRequest, control: sqlite3.Connection = CONTROL):
    """First run only: create the first superuser and their ledger, and sign them in."""
    account = identity_service.bootstrap_first_superuser(
        control, name=payload.name, email=payload.email, password=payload.password,
        timezone=payload.timezone, home_currency_code=payload.currency,
        security_question_id=payload.security_question_id, security_answer=payload.security_answer,
    )
    # One request transaction: if building the ledger fails, the account is rolled back with it.
    provisioning.provision_ledger(
        control, data_dir_from_environment(), account["id"], seed_defaults=payload.seed_defaults
    )
    ledger = provisioning.open_ledger(control, data_dir_from_environment(), account["id"])
    try:
        from monetary.application import user_service

        settings = user_service.require_settings(ledger)
    finally:
        ledger.close()
    token = identity_service.start_session(control, account)
    return InitResponse(
        owner=OwnerOut(**owner_view(settings, account)),
        access_token=token,
    )
