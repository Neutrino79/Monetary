from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from monetary.presentation.api.schemas.common import ApiModel


class TokenOut(BaseModel):
    """OAuth2 token response -- keeps the spec's snake_case keys (not camelCase) so
    standard OAuth2 clients and Swagger's Authorize button keep working."""
    access_token: str
    token_type: str = "bearer"


class SecurityQuestionOut(ApiModel):
    id: int
    text: str


class SecurityQuestionForEmailOut(ApiModel):
    security_question_id: int
    question: str


class ResetPasswordRequest(ApiModel):
    email: EmailStr
    security_answer: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(ApiModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class RegisterRequest(ApiModel):
    name: str
    email: EmailStr
    currency: str = Field(min_length=3, max_length=3)
    timezone: str | None = None
    password: str = Field(min_length=8, max_length=128)
    security_question_id: int = Field(ge=1, le=5)
    security_answer: str
