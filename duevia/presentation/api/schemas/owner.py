from __future__ import annotations

from pydantic import EmailStr, Field

from duevia.presentation.api.schemas.common import ApiModel


class InitRequest(ApiModel):
    name: str
    email: EmailStr
    currency: str = Field(min_length=3, max_length=3)
    timezone: str | None = None
    password: str = Field(min_length=8, max_length=128)
    security_question_id: int = Field(ge=1, le=5)
    security_answer: str
    seed_defaults: bool = Field(
        default=True, description="Create the default categories / income sources (configurable).")


class OwnerOut(ApiModel):
    id: int
    name: str
    email: str
    timezone: str | None
    home_currency_code: str
    ledger_mode: str
    is_superuser: bool
    security_question_id: int | None
    created_at: str
    updated_at: str


class InitResponse(ApiModel):
    owner: OwnerOut
    access_token: str = Field(description="Log in immediately -- no separate /auth/login call needed.")
    token_type: str = "bearer"


class SetupStatusOut(ApiModel):
    initialized: bool = Field(description="True once first-run setup has created the owner.")


class OwnerUpdateRequest(ApiModel):
    name: str | None = None
    timezone: str | None = None
    ledger_mode: str | None = Field(default=None, pattern="^(STRICT|DIRECT)$")
