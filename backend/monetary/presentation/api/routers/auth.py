from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm

from monetary.application import demo_service, identity_service
from monetary.config import API_PREFIX, data_dir_from_environment
from monetary.domain.security import SECURITY_QUESTIONS
from monetary.presentation.api.deps import (
    enforce_login_rate_limit,
    enforce_password_reset_rate_limit,
    enforce_register_rate_limit,
    get_account_allow_password_change,
    CONTROL,
    _client_key,
    forbid_in_demo_mode,
    oauth2_scheme,
    require_demo_mode,
)
from monetary.presentation.api.schemas.auth import (
    ChangePasswordRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SecurityQuestionForEmailOut,
    SecurityQuestionOut,
    TokenOut,
)
from monetary.presentation.api.schemas.common import MessageOut

router = APIRouter(prefix=f"{API_PREFIX}/auth", tags=["auth"])


@router.get("/security-questions", response_model=list[SecurityQuestionOut])
def list_security_questions():
    """Public -- lets a signup form render the fixed list of 5 questions."""
    return [SecurityQuestionOut(id=k, text=v) for k, v in SECURITY_QUESTIONS.items()]


@router.post(
    "/register",
    response_model=MessageOut,
    status_code=202,
    dependencies=[Depends(forbid_in_demo_mode), Depends(enforce_register_rate_limit)],
)
def register(payload: RegisterRequest, request: Request, control: sqlite3.Connection = CONTROL):
    """Public. Ask for an account; a superuser approves it. The answer is the same whether or not the
    email is already known, so this cannot be used to discover who has an account."""
    identity_service.register(
        control, name=payload.name, email=payload.email, password=payload.password,
        timezone=payload.timezone, home_currency_code=payload.currency,
        security_question_id=payload.security_question_id, security_answer=payload.security_answer,
        ip=_client_key(request),
    )
    return MessageOut(detail="Request received. You can sign in once an administrator approves it.")


@router.post("/login", response_model=TokenOut, dependencies=[Depends(enforce_login_rate_limit)])
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    control: sqlite3.Connection = CONTROL,
):
    """Standard OAuth2 password-flow shape (form-encoded, not JSON) -- this
    specific shape is what Swagger's Authorize dialog knows how to call
    automatically. `username` is your email. Rate-limited per client IP to
    slow down credential-stuffing/brute-force attempts."""
    _owner, token = identity_service.login(control, email=form_data.username, password=form_data.password)
    return TokenOut(access_token=token)


@router.post(
    "/demo",
    response_model=TokenOut,
    dependencies=[Depends(require_demo_mode), Depends(enforce_login_rate_limit)],
)
def demo_login(control: sqlite3.Connection = CONTROL):
    """Demo mode only (404 otherwise): open a session on the sample ledger without credentials.
    The sample ledger is generated on first use; see `application/demo_service.py`."""
    _owner, token = demo_service.start_demo_session(control, data_dir_from_environment())
    return TokenOut(access_token=token)


@router.post("/logout", response_model=MessageOut)
def logout(
    token: str = Depends(oauth2_scheme),
    control: sqlite3.Connection = CONTROL,
    account: dict = Depends(get_account_allow_password_change),
):
    identity_service.logout(control, token)
    return MessageOut(detail="Logged out.")


@router.post("/change-password", response_model=MessageOut, dependencies=[Depends(forbid_in_demo_mode)])
def change_password(
    payload: ChangePasswordRequest,
    control: sqlite3.Connection = CONTROL,
    account: dict = Depends(get_account_allow_password_change),
):
    identity_service.change_password(
        control, account, current_password=payload.current_password, new_password=payload.new_password
    )
    return MessageOut(detail="Password changed. Every session has been invalidated; log in again.")


@router.get(
    "/security-question",
    response_model=SecurityQuestionForEmailOut,
    dependencies=[Depends(enforce_password_reset_rate_limit)],
)
def get_security_question(email: str, control: sqlite3.Connection = CONTROL):
    """Public, part of the forgot-password flow -- step 1: look up which
    question this account uses (not the answer). Rate-limited: this endpoint
    inherently confirms whether an email has an account (needed to ask the
    right question), so it's throttled per-IP to slow down enumeration."""
    qid, text = identity_service.get_security_question(control, email)
    return SecurityQuestionForEmailOut(security_question_id=qid, question=text)


@router.post(
    "/reset-password",
    response_model=MessageOut,
    dependencies=[Depends(forbid_in_demo_mode), Depends(enforce_password_reset_rate_limit)],
)
def reset_password(payload: ResetPasswordRequest, control: sqlite3.Connection = CONTROL):
    """Public, part of the forgot-password flow -- step 2: answer the question
    to set a new password. No auth required (that's the whole point of a
    password reset flow), but the security answer stands in for it."""
    identity_service.reset_password(
        control, email=payload.email, security_answer=payload.security_answer,
        new_password=payload.new_password,
    )
    return MessageOut(detail="Password reset. Log in with your new password.")
