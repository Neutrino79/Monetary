"""Maps our domain exceptions to HTTP responses. This is the one place that
translates "what went wrong in the domain" into "what HTTP status code and
JSON body a client should see" -- application/domain code never imports
anything HTTP-related, staying framework-agnostic.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from duevia.domain.exceptions import (
    ConflictError,
    DomainError,
    NotFoundError,
    OwnershipError,
    ValidationError,
)
from duevia.domain.money import MoneyError

_STATUS_MAP = {
    NotFoundError: status.HTTP_404_NOT_FOUND,
    ValidationError: status.HTTP_422_UNPROCESSABLE_ENTITY,
    OwnershipError: status.HTTP_403_FORBIDDEN,
    ConflictError: status.HTTP_409_CONFLICT,
    MoneyError: status.HTTP_422_UNPROCESSABLE_ENTITY,
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_error_body(exc, "MoneyError"),
        )
