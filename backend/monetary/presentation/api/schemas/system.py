from __future__ import annotations

from pydantic import Field

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


class MySessionOut(ApiModel):
    id: int
    created_at: str
    expires_at: str
    last_seen_at: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    current: bool  # the session making this request


class RevokedOut(ApiModel):
    ended: int


class MyAccountOut(ApiModel):
    member_since: str
    last_login_at: str | None = None
    ledger_bytes: int | None = None  # None when the account has no ledger
    security_question_id: int | None = None
    delete_grace_days: int


class SecurityQuestionChangeRequest(ApiModel):
    current_password: str
    security_question_id: int
    security_answer: str = Field(min_length=1, max_length=200)


class DeleteAccountRequest(ApiModel):
    password: str
