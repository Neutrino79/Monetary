"""FastAPI dependency injection: a per-request SQLite connection (commit on
success, rollback on exception), OAuth2-password-flow session auth, and a
lightweight rate-limit guard for sensitive unauthenticated endpoints.

Using OAuth2PasswordBearer (rather than manually parsing the Authorization
header) is what gives Swagger UI a working "Authorize" button: it recognizes
this exact dependency shape and renders a login form that POSTs to tokenUrl,
matching our /api/v0.5/auth/login endpoint.
"""

from __future__ import annotations

import sqlite3
from typing import Iterator

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from monetary.application import captcha_service, identity_service, provisioning
from monetary.config import (
    API_PREFIX,
    data_dir_from_environment,
    demo_mode_enabled,
    legacy_db_path_from_environment,
    login_captcha_after,
)
from monetary.domain.exceptions import PasswordChangeRequired, PermissionDeniedError
from monetary.infrastructure import control_db, instance_secret
from monetary.infrastructure.rate_limiter import (
    login_failure_counter,
    captcha_rate_limiter,
    login_rate_limiter,
    password_reset_rate_limiter,
    register_rate_limiter,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{API_PREFIX}/auth/login")

_prepared_data_dirs: set[str] = set()


def prepare_control_plane(data_dir) -> None:
    """One-time-per-process start-up work on the control database: create it, and adopt the
    single-owner ledger of an earlier release as the first superuser's ledger (docs/MULTI_TENANT.md)."""
    key = str(data_dir)
    if key in _prepared_data_dirs:
        return
    control = control_db.connect_control(data_dir)
    try:
        legacy = legacy_db_path_from_environment()
        if legacy is not None and not identity_service.users_exist(control):
            provisioning.adopt_legacy_ledger(control, data_dir, legacy)
        control.commit()
    finally:
        control.close()
    _prepared_data_dirs.add(key)


def get_control() -> Iterator[sqlite3.Connection]:
    data_dir = data_dir_from_environment()
    prepare_control_plane(data_dir)
    conn = control_db.connect_control(data_dir)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _function_scoped(dependency):
    """`Depends` that commits *before* the response is sent.

    By default newer FastAPI runs a `yield` dependency's cleanup (our commit) *after* the response has
    gone out, so a client that fires its next request immediately -- as a browser app does -- can read
    the database before the previous write is committed (e.g. a settlement that "isn't there" right
    after the split it settles, or a password reset that has no effect on the very next login).
    `scope="function"` closes that gap. Older FastAPI versions already commit before responding and
    don't know the argument."""
    try:
        return Depends(dependency, scope="function")
    except TypeError:
        return Depends(dependency)


CONTROL = _function_scoped(get_control)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Invalid or expired session token; log in again via {API_PREFIX}/auth/login.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _authenticate(control: sqlite3.Connection, token: str) -> dict:
    account = identity_service.verify_session(control, token)
    if account is None:
        # verify_session may have purged an expired session; persist that before the 401 below
        # makes the dependency roll the transaction back.
        control.commit()
        raise _unauthorized()
    return account


def get_account_allow_password_change(
    control: sqlite3.Connection = CONTROL, token: str = Depends(oauth2_scheme)
) -> dict:
    """The signed-in platform account, even while a forced password change is pending."""
    return _authenticate(control, token)


def get_current_account(
    account: dict = Depends(get_account_allow_password_change),
) -> dict:
    """The signed-in platform account. Everything except changing the password, logging out and
    /me requires that a temporary password has already been replaced."""
    if account["must_change_password"]:
        raise PasswordChangeRequired("Choose a new password before continuing.")
    return account


def get_superuser(account: dict = Depends(get_current_account)) -> dict:
    """The signed-in account, only if it is a superuser (the role is read from the control database on
    every request, so a demotion or suspension takes effect immediately). Administration is not
    available in demo mode."""
    if demo_mode_enabled():
        raise PermissionDeniedError("Administration is disabled in demo mode.")
    if account["role"] != "superuser":
        raise PermissionDeniedError("Superuser access required.")
    return account


def get_db(
    account: dict = Depends(get_current_account), control: sqlite3.Connection = CONTROL
) -> Iterator[sqlite3.Connection]:
    """The signed-in user's own ledger database (commit on success, rollback on exception)."""
    conn = provisioning.open_ledger(control, data_dir_from_environment(), account["id"])
    if conn is None:
        raise provisioning.NoLedgerError("This account has no ledger.")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


DB = _function_scoped(get_db)


def get_current_owner(conn: sqlite3.Connection = DB, account: dict = Depends(get_current_account)) -> dict:
    """The ledger owner row inside the caller's own ledger, with the platform account's security
    question id (that lives in the control database)."""
    from monetary.application import user_service

    owner = user_service.require_owner(conn)
    return {**owner, "security_question_id": account["security_question_id"]}


def _client_key(request: Request) -> str:
    """Best-effort caller identity for rate limiting. Behind a reverse proxy,
    deploy with --proxy-headers / a trusted X-Forwarded-For setup so
    request.client.host reflects the real client, not the proxy."""
    return request.client.host if request.client else "unknown"


def enforce_login_rate_limit(request: Request) -> None:
    # RateLimitError is a DomainError: the shared handler renders it as
    # 429 {"detail": ..., "error_type": "RateLimitError"}.
    login_rate_limiter.check(_client_key(request))


def enforce_password_reset_rate_limit(request: Request) -> None:
    password_reset_rate_limiter.check(_client_key(request))


def enforce_captcha_rate_limit(request: Request) -> None:
    captcha_rate_limiter.check(_client_key(request))


def enforce_register_rate_limit(request: Request) -> None:
    register_rate_limiter.check(_client_key(request))


def server_secret() -> bytes:
    return instance_secret.load_secret(data_dir_from_environment())


def require_captcha(request: Request) -> None:
    """Gate for public forms that bots love: a solved captcha in the `X-Captcha` header (a no-op when
    MONETARY_CAPTCHA_PROVIDER=none)."""
    captcha_service.require(request.headers.get("X-Captcha"), server_secret(), remote_ip=_client_key(request))


def require_login_captcha(request: Request) -> None:
    """Sign-in needs a captcha only once this client address has failed a few times in a row."""
    if login_failure_counter.count(_client_key(request)) >= login_captcha_after():
        require_captcha(request)


def require_demo_mode() -> None:
    """Gate for demo-only endpoints: they do not exist (404) unless MONETARY_DEMO_MODE is on."""
    if not demo_mode_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


def forbid_in_demo_mode() -> None:
    """Gate for actions that could lock other visitors out of a shared demo (password changes)."""
    if demo_mode_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is disabled in demo mode.",
        )
