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
    locked_until: str | None = None
    password_expires_at: str | None = None
    rerequest_count: int = 0
    approved_at: str | None = None
    approved_by: int | None = None
    created_at: str
    updated_at: str
    last_activity_at: str | None = None
    storage_bytes: int | None = None


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
    active_admins: int = 0
    overdue_for_purge: int = 0
    ledger_count: int = 0
    ledger_bytes: int = 0


class PlatformSettingOut(ApiModel):
    key: str
    label: str
    value: str


class PlatformOut(ApiModel):
    """Read-only facts about the installation (superuser only). Never includes keys or secrets."""
    version: str
    api_version: str
    environment: str
    demo_mode: bool
    settings: list[PlatformSettingOut]
    control_db_bytes: int
    ledger_count: int
    ledger_bytes: int


class AuditEntryOut(ApiModel):
    id: int
    at: str
    actor_user_id: int | None = None
    action: str
    target_user_id: int | None = None
    detail: str | None = None
    ip: str | None = None


class SessionOut(ApiModel):
    id: int
    created_at: str
    expires_at: str
    last_seen_at: str | None = None
    ip: str | None = None
    user_agent: str | None = None


class UpdateUserRequest(ApiModel):
    name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    timezone: str | None = None


class BulkRequest(ApiModel):
    action: str
    user_ids: list[int] = Field(min_length=1, max_length=1000)  # the real cap is a setting
    reason: str | None = Field(default=None, max_length=300)


class BulkItemOut(ApiModel):
    user_id: int
    ok: bool
    error: str | None = None


class BulkOut(ApiModel):
    action: str
    succeeded: int
    failed: int
    results: list[BulkItemOut]


class PurgeOut(ApiModel):
    purged: int
