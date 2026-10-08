from __future__ import annotations

from pydantic import Field

from duevia.presentation.api.schemas.common import ApiModel, MoneyOut


class AccountCreate(ApiModel):
    name: str
    type: str = Field(pattern="^(ASSET|LIABILITY)$")
    currency: str = Field(min_length=3, max_length=3)
    subtype: str | None = Field(default=None, pattern="^(bank|cash|wallet|credit_card)$")
    credit_limit: str | None = Field(default=None, description="LIABILITY only. Major units, e.g. '50000.00'")
    statement_day: int | None = Field(default=None, ge=1, le=31, description="LIABILITY only")
    opening_balance: str | None = Field(
        default=None, description="Major units, >= 0. Posted as an 'Opening balance' ADJUSTMENT entry; "
                                  "for a LIABILITY it is the amount already owed.")
    opening_date: str | None = Field(default=None, description="'YYYY-MM-DD', local time; defaults to now")


class AccountUpdate(ApiModel):
    """Partial update: only the keys you send change; an explicit null clears
    `creditLimit` / `statementDay`. Opening balance is create-only by design --
    corrections go through adjustment entries."""
    name: str | None = None
    subtype: str | None = Field(default=None, pattern="^(bank|cash|wallet|credit_card)$")
    credit_limit: str | None = None
    statement_day: int | None = Field(default=None, ge=1, le=31)


class AccountOut(ApiModel):
    id: int
    name: str
    account_type: str
    currency_code: str
    is_active: bool
    subtype: str
    credit_limit: MoneyOut | None
    statement_day: int | None
    balance: MoneyOut
    created_at: str
    updated_at: str


class AccountBalanceOut(ApiModel):
    account_id: int
    name: str
    account_type: str
    balance: MoneyOut


class CategoryCreate(ApiModel):
    name: str
    type: str = Field(pattern="^(EXPENSE|INCOME)$")
    parent_id: int | None = None
    budget_limit: str | None = Field(default=None, description="Major units, e.g. '5000.00'")
    currency: str | None = Field(default=None, description="Defaults to your home currency")
    color: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")


class CategoryUpdate(ApiModel):
    """Partial update; an explicit null clears `color`, `budgetLimit`, or moves
    the category to the top level (`parentId`)."""
    name: str | None = None
    color: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    budget_limit: str | None = None
    parent_id: int | None = None


class CategoryOut(ApiModel):
    id: int
    name: str
    account_type: str
    currency_code: str
    parent_id: int | None
    budget_limit: MoneyOut | None
    color: str | None
    is_active: bool
    created_at: str
    updated_at: str
