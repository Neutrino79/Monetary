from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class InitRequest(BaseModel):
    name: str
    email: EmailStr
    currency: str = Field(min_length=3, max_length=3)
    timezone: str | None = None
    password: str = Field(min_length=8)
    security_question_id: int = Field(ge=1, le=5)
    security_answer: str


class OwnerOut(BaseModel):
    id: int
    name: str
    email: str
    timezone: str | None
    home_currency_code: str
    ledger_mode: str


class InitResponse(BaseModel):
    owner: OwnerOut
    access_token: str = Field(description="Log in immediately -- no separate /auth/login call needed.")
    token_type: str = "bearer"


class OwnerUpdateRequest(BaseModel):
    name: str | None = None
    timezone: str | None = None
    ledger_mode: str | None = Field(default=None, pattern="^(STRICT|DIRECT)$")
