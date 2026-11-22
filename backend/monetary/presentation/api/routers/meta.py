from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from monetary.config import API_PREFIX, API_VERSION, VERSION, app_name, app_tagline, demo_mode_enabled
from monetary.application import admin_service, identity_service, operations
from monetary.config import data_dir_from_environment
from monetary.infrastructure import control_repository as crepo
from monetary.presentation.api.deps import (
    CONTROL,
    forbid_in_demo_mode,
    get_account_allow_password_change,
    get_current_account,
    oauth2_scheme,
)
from monetary.presentation.api.schemas.common import MessageOut
from monetary.presentation.api.schemas.system import (
    DeleteAccountRequest,
    MeOut,
    MetaOut,
    MyAccountOut,
    MySessionOut,
    RevokedOut,
    SecurityQuestionChangeRequest,
)

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


@router.get("/me/account", response_model=MyAccountOut)
def my_account(account: dict = Depends(get_current_account), control: sqlite3.Connection = CONTROL):
    """Facts for the Settings account card: member since, last sign-in and how big the ledger is."""
    workspace = crepo.get_workspace_for_user(control, account["id"])
    size = operations.ledger_bytes(data_dir_from_environment(), workspace) if workspace is not None else None
    return MyAccountOut(
        member_since=account["created_at"], last_login_at=account.get("last_login_at"), ledger_bytes=size,
        security_question_id=account["security_question_id"], delete_grace_days=admin_service.DELETE_GRACE_DAYS,
    )


@router.get("/me/sessions", response_model=list[MySessionOut])
def my_sessions(account: dict = Depends(get_current_account), token: str = Depends(oauth2_scheme),
                control: sqlite3.Connection = CONTROL):
    """Where you are signed in (browser, address, times); your current session is marked."""
    return [MySessionOut(**s) for s in identity_service.list_my_sessions(control, account, token)]


@router.post("/me/sessions/revoke-others", response_model=RevokedOut, dependencies=[Depends(forbid_in_demo_mode)])
def revoke_other_sessions(account: dict = Depends(get_current_account), token: str = Depends(oauth2_scheme),
                          control: sqlite3.Connection = CONTROL):
    """Sign out every device except this one."""
    return RevokedOut(ended=identity_service.revoke_other_sessions(control, account, token))


@router.delete("/me/sessions/{session_id}", response_model=MessageOut, dependencies=[Depends(forbid_in_demo_mode)])
def revoke_my_session(session_id: int, account: dict = Depends(get_current_account),
                      control: sqlite3.Connection = CONTROL):
    """Sign out one device (including this one, which is the same as logging out)."""
    identity_service.revoke_my_session(control, account, session_id)
    return MessageOut(detail="Signed out.")


@router.put("/me/security-question", response_model=MessageOut, dependencies=[Depends(forbid_in_demo_mode)])
def change_security_question(payload: SecurityQuestionChangeRequest, account: dict = Depends(get_current_account),
                             control: sqlite3.Connection = CONTROL):
    identity_service.change_security_question(
        control, account, current_password=payload.current_password,
        question_id=payload.security_question_id, answer=payload.security_answer)
    return MessageOut(detail="Security question updated.")


@router.post("/me/delete", response_model=MessageOut, dependencies=[Depends(forbid_in_demo_mode)])
def delete_my_account(payload: DeleteAccountRequest, account: dict = Depends(get_current_account),
                      control: sqlite3.Connection = CONTROL):
    """Delete your own account: locked now, restorable by the superuser during the grace period."""
    identity_service.delete_my_account(
        control, account, password=payload.password, grace_days=admin_service.DELETE_GRACE_DAYS)
    return MessageOut(detail="Account scheduled for deletion.")
