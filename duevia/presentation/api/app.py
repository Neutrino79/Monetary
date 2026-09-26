"""FastAPI application entry point.

Run with: uvicorn duevia.presentation.api.app:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from duevia.config import API_PREFIX, PROJECT_NAME, VERSION, cors_origins_from_environment
from duevia.presentation.api.errors import register_exception_handlers
from duevia.presentation.api.routers import (
    accounts,
    auth,
    friends,
    owner,
    reports,
    settlements,
    setup,
    splits,
    transactions,
    transfers,
)

app = FastAPI(
    title=f"{PROJECT_NAME} API",
    version=VERSION,
    description="Double-entry ledger API for personal expense tracking and friend splitting. "
                 f"Single owner, email+password login (see {API_PREFIX}/setup/init to bootstrap, "
                 f"then {API_PREFIX}/auth/login or the Authorize button above).",
)

# CORS: open by default for local UI development (e.g. Streamlit on a different
# port). Tighten via DUEVIA_CORS_ORIGINS (comma-separated) before any
# non-local deployment.
_origins = cors_origins_from_environment()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _origins == "*" else _origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(setup.router)
app.include_router(auth.router)
app.include_router(owner.router)
app.include_router(accounts.router)
app.include_router(friends.router)
app.include_router(transactions.router)
app.include_router(splits.router)
app.include_router(transfers.router)
app.include_router(settlements.router)
app.include_router(reports.router)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


@app.get("/", tags=["system"])
def root():
    return {
        "name": f"{PROJECT_NAME} API",
        "version": VERSION,
        "status": "ok",
        "api_base": API_PREFIX,
        "docs": "/docs",
        "openapi": "/openapi.json",
        "health": "/health",
    }
