from __future__ import annotations

from pydantic import BaseModel, Field

from duevia.presentation.api.schemas.common import MoneyOut


class AccountCreate(BaseModel):
    name: str
    type: str = Field(pattern="^(ASSET|LIABILITY)$")
    currency: str = Field(min_length=3, max_length=3)


class AccountOut(BaseModel):
    id: int
    name: str
    account_type: str
    currency_code: str
    is_active: bool


class AccountBalanceOut(BaseModel):
    account_id: int
    name: str
    account_type: str
    balance: MoneyOut


class CategoryCreate(BaseModel):
    name: str
    type: str = Field(pattern="^(EXPENSE|INCOME)$")
    parent_id: int | None = None
    budget_limit: str | None = Field(default=None, description="Major units, e.g. '5000.00'")
    currency: str | None = Field(default=None, description="Defaults to your home currency")


class CategoryOut(BaseModel):
    id: int
    name: str
    account_type: str
    currency_code: str
    parent_account_id: int | None
    budget_limit: int | None
    is_active: bool
