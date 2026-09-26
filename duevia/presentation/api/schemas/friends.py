from __future__ import annotations

from pydantic import BaseModel, EmailStr

from duevia.presentation.api.schemas.common import MoneyOut


class FriendCreate(BaseModel):
    name: str
    email: EmailStr
    currency: str | None = None


class FriendOut(BaseModel):
    id: int
    name: str
    email: str
    due_account_id: int


class FriendRename(BaseModel):
    name: str


class FriendBalanceOut(BaseModel):
    friend_id: int
    friend_name: str
    balance: MoneyOut  # positive = they owe you; negative = you owe them


class StatementRowOut(BaseModel):
    entry_id: int
    description: str
    entry_type: str
    entry_date: str
    status: str
    delta: MoneyOut
    running_balance: MoneyOut
