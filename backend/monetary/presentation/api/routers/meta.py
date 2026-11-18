from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from monetary.config import API_PREFIX, API_VERSION, VERSION, app_name, app_tagline, demo_mode_enabled
from monetary.application import operations
from monetary.config import data_dir_from_environment
from monetary.infrastructure import control_repository as crepo
from monetary.presentation.api.deps import (
    CONTROL,
    forbid_in_demo_mode,
    get_account_allow_password_change,
    get_current_account,
)
from monetary.presentation.api.schemas.system import MeOut, MetaOut

router = APIRouter(prefix=API_PREFIX, tags=["system"])


@router.get("/meta", response_model=MetaOut)
def meta():
    """Public application identity (name, tagline, version)."""
    return MetaOut(app_name=app_name(), tagline=app_tagline(), version=VERSION, api_version=API_VERSION,
                   demo=demo_mode_enabled())


@router.get("/me", response_model=MeOut)
def me(account: dict = Depends(get_account_allow_password_change), control: sqlite3.Connection = CONTROL):
    """Who is signed in: the platform account (role, state) and whether it has a ledger. Available even
    while a forced password change is pending, so the client can show the right screen."""
    return MeOut(
        id=account["id"], email=account["email"], name=account["name"], role=account["role"],
        status=account["status"], must_change_password=bool(account["must_change_password"]),
        has_ledger=crepo.get_workspace_for_user(control, account["id"]) is not None,
    )


def _remove_export(path) -> None:
    import shutil

    shutil.rmtree(path.parent, ignore_errors=True)


@router.get("/me/export", dependencies=[Depends(forbid_in_demo_mode)])
def export_my_data(account: dict = Depends(get_current_account), control: sqlite3.Connection = CONTROL):
    """Download your own ledger as a SQLite file: a consistent snapshot, with no password hashes,
    security answers or sessions in it. Only the signed-in user's own ledger can be exported."""
    from datetime import date

    path = operations.export_ledger(control, data_dir_from_environment(), account["id"])
    return FileResponse(
        path, media_type="application/vnd.sqlite3", filename=f"ledger-{date.today().isoformat()}.db",
        background=BackgroundTask(_remove_export, path),
    )
