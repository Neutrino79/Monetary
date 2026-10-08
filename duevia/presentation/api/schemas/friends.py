from __future__ import annotations

from pydantic import EmailStr, Field

from duevia.presentation.api.schemas.common import ApiModel, MoneyOut


class FriendCreate(ApiModel):
    name: str
    email: EmailStr
    phone: str | None = Field(default=None, max_length=40)
    currency: str | None = None


class FriendOut(ApiModel):
    id: int
    name: str
    email: str
    phone: str | None
    due_account_id: int
    created_at: str


class FriendUpdate(ApiModel):
    """Partial update; an explicit null `phone` clears it."""
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)


class FriendBalanceOut(ApiModel):
    friend_id: int
    friend_name: str
    balance: MoneyOut  # positive = they owe you; negative = you owe them


class StatementRowOut(ApiModel):
    entry_id: int
    description: str
    entry_type: str
    entry_date: str
    status: str
    delta: MoneyOut
    running_balance: MoneyOut
