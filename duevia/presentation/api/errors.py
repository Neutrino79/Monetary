"""Maps our domain exceptions to HTTP responses. This is the one place that
translates "what went wrong in the domain" into "what HTTP status code and
JSON body a client should see" -- application/domain code never imports
anything HTTP-related, staying framework-agnostic.

Also installs a catch-all handler for anything unexpected: a bare 500 with a
generic message (never the raw exception text or a traceback) so an internal
bug can never leak implementation details to a client, plus a server-side log
line with the real exception for whoever is operating the service.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from duevia.domain.exceptions import (
    ConflictError,
    DomainError,
    NotFoundError,
    OwnershipError,
    RateLimitError,
    ValidationError,
)
from duevia.domain.money import MoneyError

logger = logging.getLogger("duevia.api")

_STATUS_MAP = {
    NotFoundError: status.HTTP_404_NOT_FOUND,
    ValidationError: 422,
    OwnershipError: status.HTTP_403_FORBIDDEN,
    ConflictError: status.HTTP_409_CONFLICT,
    RateLimitError: status.HTTP_429_TOO_MANY_REQUESTS,
    MoneyError: 422,
}


def _error_body(exc: Exception, error_type: str) -> dict:
    return {"detail": str(exc), "error_type": error_type}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
        code = _STATUS_MAP.get(type(exc), status.HTTP_400_BAD_REQUEST)
        return JSONResponse(status_code=code, content=_error_body(exc, type(exc).__name__))

    @app.exception_handler(MoneyError)
    async def money_error_handler(request: Request, exc: MoneyError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_body(exc, "MoneyError"),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception while processing %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error.", "error_type": "InternalError"},
        )
