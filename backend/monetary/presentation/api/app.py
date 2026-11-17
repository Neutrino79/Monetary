"""FastAPI application entry point.

Run with: uvicorn monetary.presentation.api.app:app --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from monetary.config import (
    API_PREFIX,
    VERSION,
    app_name,
    cors_origins_from_environment,
    data_dir_from_environment,
    demo_mode_enabled,
    demo_reset_on_start,
    docs_enabled_from_environment,
    environment_name,
)
from monetary.presentation.api.errors import register_exception_handlers
from monetary.presentation.api.routers import (
    accounts,
    auth,
    friends,
    meta,
    owner,
    reports,
    settlements,
    setup,
    tags,
    splits,
    transactions,
    transfers,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

_docs_enabled = docs_enabled_from_environment()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """In demo mode, build the sample ledger at startup so a misconfiguration (a real database
    behind MONETARY_DEMO_MODE) fails fast instead of on the first visitor's request."""
    if demo_mode_enabled():
        from monetary.application import demo_service
        from monetary.infrastructure import control_db

        data_dir = data_dir_from_environment()
        if demo_reset_on_start():
            demo_service.reset_demo_data(data_dir)
        control = control_db.connect_control(data_dir)
        try:
            demo_service.ensure_demo_account(control, data_dir)
            control.commit()
        finally:
            control.close()
        logging.getLogger(__name__).warning(
            "DEMO MODE is on: anyone can open the sample ledger without a password. Never use it with real data.")
    yield

app = FastAPI(
    lifespan=lifespan,
    title=f"{app_name()} API",
    version=VERSION,
    description="Double-entry ledger API for personal expense tracking and friend splitting. "
                 f"Single owner, email+password login (see {API_PREFIX}/setup/init to bootstrap, "
                 f"then {API_PREFIX}/auth/login or the Authorize button above). This is an "
                 "API-only service -- there is no bundled CLI or UI.",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# --------------------------------------------------------------------------- #
# CORS
# --------------------------------------------------------------------------- #
# Wildcard origins ("*") and allow_credentials=True are mutually exclusive in
# the CORS spec (and most browsers/clients reject the combination outright),
# so the two must never both be enabled. Default is "no origins configured" --
# safe, but the API won't be reachable from a browser-based client until
# MONETARY_CORS_ORIGINS is set. Local development: e.g.
#   MONETARY_CORS_ORIGINS=http://localhost:8501,http://localhost:3000
_origins_raw = cors_origins_from_environment()
if _origins_raw.strip() == "*":
    _origins = ["*"]
    _allow_credentials = False
elif _origins_raw.strip():
    _origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]
    _allow_credentials = True
else:
    _origins = []
    _allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Baseline hardening headers. HSTS is only meaningful (and only sent)
    once the service is actually served over HTTPS -- typically added by a
    fronting reverse proxy/load balancer, but harmless to also set here."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if environment_name() == "production":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
    return response


register_exception_handlers(app)

app.include_router(meta.router)
app.include_router(setup.router)
app.include_router(auth.router)
app.include_router(owner.router)
app.include_router(accounts.router)
app.include_router(friends.router)
app.include_router(transactions.router)
app.include_router(splits.router)
app.include_router(transfers.router)
app.include_router(settlements.router)
app.include_router(tags.router)
app.include_router(reports.router)


@app.get("/health", tags=["system"])
def health():
    """Liveness/readiness check. Also verifies the database file is reachable
    and the schema bootstraps cleanly, since a broken DB_PATH or permissions
    issue should show up here rather than as a 500 on the first real request."""
    from monetary.infrastructure import control_db

    try:
        conn = control_db.connect_control(data_dir_from_environment())
        conn.execute("SELECT 1")
        conn.close()
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "unreachable"}


@app.get("/", tags=["system"])
def root():
    return {
        "name": f"{app_name()} API",
        "version": VERSION,
        "status": "ok",
        "api_base": API_PREFIX,
        "docs": "/docs" if _docs_enabled else None,
        "openapi": "/openapi.json" if _docs_enabled else None,
        "health": "/health",
    }
