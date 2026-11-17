from __future__ import annotations

from monetary.presentation.api.schemas.common import ApiModel


class MetaOut(ApiModel):
    """Public, unauthenticated application identity. The web app reads the
    product name from here so renaming it is a backend configuration change."""
    app_name: str
    tagline: str
    version: str
    api_version: str
    demo: bool = False  # True when the server runs in demo mode (sample data, no sign-in)


class MeOut(ApiModel):
    """The signed-in platform account (not the ledger owner row; see GET /owner for that)."""
    id: int
    email: str
    name: str
    role: str  # "user" | "superuser"
    status: str
    must_change_password: bool
    has_ledger: bool
