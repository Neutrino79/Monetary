from __future__ import annotations

from pydantic import EmailStr, Field

from monetary.presentation.api.schemas.common import ApiModel


class AdminUserOut(ApiModel):
    id: int
    email: str
    name: str
    role: str
    status: str
    status_reason: str | None = None
    must_change_password: bool
    timezone: str | None = None
    home_currency_code: str | None = None
    plan: str | None = None
    access_until: str | None = None
    delete_after: str | None = None
    last_login_at: str | None = None
    approved_at: str | None = None
    approved_by: int | None = None
    created_at: str
    updated_at: str


class AdminCreateUserRequest(ApiModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    currency: str = Field(min_length=3, max_length=3)
    timezone: str | None = None
    role: str = "user"


class AdminCreatedUserOut(ApiModel):
    """The one place a temporary password is ever shown. It cannot be fetched again."""
    user: AdminUserOut
    temporary_password: str


class ReasonRequest(ApiModel):
    reason: str | None = Field(default=None, max_length=300)


class RoleRequest(ApiModel):
    role: str


class AdminStatsOut(ApiModel):
    total_users: int
    by_status: dict[str, int]
    pending_approval: int
    active_superusers: int
    ledger_count: int = 0
    ledger_bytes: int = 0


class AuditEntryOut(ApiModel):
    id: int
    at: str
    actor_user_id: int | None = None
    action: str
    target_user_id: int | None = None
    detail: str | None = None
    ip: str | None = None
