from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SecurityQuestionOut(BaseModel):
    id: int
    text: str


class SecurityQuestionForEmailOut(BaseModel):
    security_question_id: int
    question: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    security_answer: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
