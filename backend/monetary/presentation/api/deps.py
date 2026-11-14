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

from monetary.application import user_service
from monetary.config import API_PREFIX, database_path_from_environment, demo_mode_enabled
from monetary.infrastructure import db
from monetary.infrastructure.rate_limiter import (
    login_rate_limiter,
    password_reset_rate_limiter,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{API_PREFIX}/auth/login")


def get_db() -> Iterator[sqlite3.Connection]:
    conn = db.connect(database_path_from_environment())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _db_dependency():
    """The per-request connection dependency, committed *before* the response is sent.

    By default newer FastAPI runs a `yield` dependency's cleanup (our commit) *after* the
    response has gone out, so a client that fires its next request immediately -- as a
    browser app does -- can read the database before the previous write is committed
    (e.g. a settlement that "isn't there" right after the split it settles, or a password
    reset that has no effect on the very next login). `scope="function"` closes that gap.
    Older FastAPI versions already commit before responding and don't know the argument.
    """
    try:
        return Depends(get_db, scope="function")
    except TypeError:
        return Depends(get_db)


DB = _db_dependency()


def get_current_owner(
    conn: sqlite3.Connection = DB,
    token: str = Depends(oauth2_scheme),
) -> dict:
    """Every endpoint except /setup/init, /auth/* (pre-login), and /health
    depends on this. An invalid or expired session token returns 401 before
    any application/domain code runs."""
    owner = user_service.verify_session(conn, token)
    if owner is None:
        # verify_session may have purged an expired session; persist that before
        # the 401 below makes get_db roll the transaction back.
        conn.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired session token; log in again via {API_PREFIX}/auth/login.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return owner


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
