from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm

from monetary.application import captcha_service, demo_service, identity_service
from monetary.config import API_PREFIX, data_dir_from_environment
from monetary.domain.exceptions import AuthenticationError, ValidationError
from monetary.domain.security import SECURITY_QUESTIONS
from monetary.infrastructure.rate_limiter import login_failure_counter
from monetary.presentation.api.deps import (
    enforce_captcha_rate_limit,
    enforce_login_rate_limit,
    enforce_password_reset_rate_limit,
    enforce_register_rate_limit,
    get_account_allow_password_change,
    CONTROL,
    _client_key,
    forbid_in_demo_mode,
    oauth2_scheme,
    require_captcha,
    require_demo_mode,
    require_login_captcha,
    server_secret,
)
from monetary.presentation.api.schemas.auth import (
    CaptchaConfigOut,
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


@router.get("/captcha", response_model=CaptchaConfigOut, dependencies=[Depends(enforce_captcha_rate_limit)])
def captcha_config():
    """Public. Which captcha the forms must solve (`none`, `altcha` or `turnstile`) and, for the built-in
    proof of work, a fresh signed challenge. Send the solution in the `X-Captcha` header."""
    return CaptchaConfigOut(**captcha_service.public_config(server_secret()))


@router.post(
    "/register",
    response_model=MessageOut,
    status_code=202,
    dependencies=[Depends(forbid_in_demo_mode), Depends(enforce_register_rate_limit), Depends(require_captcha)],
)
def register(payload: RegisterRequest, request: Request, control: sqlite3.Connection = CONTROL):
    """Public. Ask for an account; a superuser approves it. The answer is the same whether or not the
    email is already known, so this cannot be used to discover who has an account."""
    if payload.website:  # the hidden honeypot field was filled in: a bot. Answer as usual, do nothing.
        return MessageOut(detail="Request received. You can sign in once an administrator approves it.")
    identity_service.register(
        control, name=payload.name, email=payload.email, password=payload.password,
        timezone=payload.timezone, home_currency_code=payload.currency,
        security_question_id=payload.security_question_id, security_answer=payload.security_answer,
        ip=_client_key(request),
    )
    return MessageOut(detail="Request received. You can sign in once an administrator approves it.")


@router.post(
    "/login",
    response_model=TokenOut,
    dependencies=[Depends(enforce_login_rate_limit), Depends(require_login_captcha)],
)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    control: sqlite3.Connection = CONTROL,
):
    """Standard OAuth2 password-flow shape (form-encoded, not JSON) -- this
    specific shape is what Swagger's Authorize dialog knows how to call
    automatically. `username` is your email. Rate-limited per client IP to
    slow down credential-stuffing/brute-force attempts."""
    try:
        _owner, token = identity_service.login(
            control, email=form_data.username, password=form_data.password, ip=_client_key(request),
            user_agent=request.headers.get("user-agent"))
    except AuthenticationError:
        # A wrong password is counted on the account and on this client; keep that although the
        # request fails (the dependency would otherwise roll it back).
        login_failure_counter.record(_client_key(request))
        control.commit()
        raise
    login_failure_counter.reset(_client_key(request))
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
    dependencies=[Depends(enforce_password_reset_rate_limit), Depends(require_captcha)],
)
def get_security_question(email: str, control: sqlite3.Connection = CONTROL):
    """Public, part of the forgot-password flow -- step 1: look up which question this account uses
    (not the answer). An email with no usable account gets a stable decoy question, so the answer does
    not reveal who has an account. Rate-limited and captcha-protected."""
    qid, text = identity_service.get_security_question(control, email, server_secret())
    return SecurityQuestionForEmailOut(security_question_id=qid, question=text)


@router.post(
    "/reset-password",
    response_model=MessageOut,
    dependencies=[Depends(forbid_in_demo_mode), Depends(enforce_password_reset_rate_limit),
                  Depends(require_captcha)],
)
def reset_password(payload: ResetPasswordRequest, control: sqlite3.Connection = CONTROL):
    """Public, part of the forgot-password flow -- step 2: answer the question
    to set a new password. No auth required (that's the whole point of a
    password reset flow), but the security answer stands in for it."""
    try:
        identity_service.reset_password(
            control, email=payload.email, security_answer=payload.security_answer,
            new_password=payload.new_password,
        )
    except ValidationError:
        control.commit()  # a wrong answer counts towards the account lock, so it must be saved
        raise
    return MessageOut(detail="Password reset. Log in with your new password.")
