from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm

from duevia.application import user_service
from duevia.config import API_PREFIX
from duevia.domain.security import SECURITY_QUESTIONS
from duevia.presentation.api.deps import (
    enforce_login_rate_limit,
    enforce_password_reset_rate_limit,
    get_current_owner,
    get_db,
    oauth2_scheme,
)
from duevia.presentation.api.schemas.auth import (
    ChangePasswordRequest,
    ResetPasswordRequest,
    SecurityQuestionForEmailOut,
    SecurityQuestionOut,
    TokenOut,
)
from duevia.presentation.api.schemas.common import MessageOut

router = APIRouter(prefix=f"{API_PREFIX}/auth", tags=["auth"])


@router.get("/security-questions", response_model=list[SecurityQuestionOut])
def list_security_questions():
    """Public -- lets a signup form render the fixed list of 5 questions."""
    return [SecurityQuestionOut(id=k, text=v) for k, v in SECURITY_QUESTIONS.items()]


@router.post("/login", response_model=TokenOut, dependencies=[Depends(enforce_login_rate_limit)])
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Standard OAuth2 password-flow shape (form-encoded, not JSON) -- this
    specific shape is what Swagger's Authorize dialog knows how to call
    automatically. `username` is your email. Rate-limited per client IP to
    slow down credential-stuffing/brute-force attempts."""
    _owner, token = user_service.login(conn, email=form_data.username, password=form_data.password)
    return TokenOut(access_token=token)


@router.post("/logout", response_model=MessageOut)
def logout(
    token: str = Depends(oauth2_scheme),
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    user_service.logout(conn, token)
    return MessageOut(detail="Logged out.")


@router.post("/change-password", response_model=MessageOut)
def change_password(
    payload: ChangePasswordRequest,
    conn: sqlite3.Connection = Depends(get_db),
    owner: dict = Depends(get_current_owner),
):
    user_service.change_password(
        conn, current_password=payload.current_password, new_password=payload.new_password
    )
    return MessageOut(detail="Password changed. Every session has been invalidated; log in again.")


@router.get(
    "/security-question",
    response_model=SecurityQuestionForEmailOut,
    dependencies=[Depends(enforce_password_reset_rate_limit)],
)
def get_security_question(email: str, conn: sqlite3.Connection = Depends(get_db)):
    """Public, part of the forgot-password flow -- step 1: look up which
    question this account uses (not the answer). Rate-limited: this endpoint
    inherently confirms whether an email has an account (needed to ask the
    right question), so it's throttled per-IP to slow down enumeration."""
    qid, text = user_service.get_security_question(conn, email)
    return SecurityQuestionForEmailOut(security_question_id=qid, question=text)


@router.post(
    "/reset-password",
    response_model=MessageOut,
    dependencies=[Depends(enforce_password_reset_rate_limit)],
)
def reset_password(payload: ResetPasswordRequest, conn: sqlite3.Connection = Depends(get_db)):
    """Public, part of the forgot-password flow -- step 2: answer the question
    to set a new password. No auth required (that's the whole point of a
    password reset flow), but the security answer stands in for it."""
    user_service.reset_password(
        conn, email=payload.email, security_answer=payload.security_answer,
        new_password=payload.new_password,
    )
    return MessageOut(detail="Password reset. Log in with your new password.")
