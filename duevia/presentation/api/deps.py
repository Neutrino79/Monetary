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

from duevia.application import user_service
from duevia.config import API_PREFIX, database_path_from_environment
from duevia.infrastructure import db
from duevia.infrastructure.rate_limiter import (
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


def get_current_owner(
    conn: sqlite3.Connection = Depends(get_db),
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
