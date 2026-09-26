from __future__ import annotations

from pydantic import BaseModel, Field

from duevia.presentation.api.schemas.common import MoneyOut


class PostingOut(BaseModel):
    account_id: int
    account_name: str
    account_type: str
    side: str  # DEBIT | CREDIT
    amount: MoneyOut


class EntryOut(BaseModel):
    id: int
    description: str
    memo: str | None
    entry_type: str
    currency_code: str
    entry_date: str
    status: str
    category_id: int | None
    refund_of_id: int | None
    reversal_of_id: int | None
    reversed_by_id: int | None
    amount: MoneyOut  # the "headline" amount -- largest leg, for list views


class EntryDetailOut(EntryOut):
    postings: list[PostingOut]


class ExpenseCreate(BaseModel):
    account_id: int
    category_id: int
    amount: str = Field(description="Major units, e.g. '249.99'")
    title: str
    date: str | None = Field(default=None, description="'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM', local time")
    note: str | None = None


class IncomeCreate(ExpenseCreate):
    pass


class RefundCreate(BaseModel):
    for_entry_id: int
    amount: str
    account_id: int | None = None
    category_id: int | None = None
    title: str | None = None
    date: str | None = None
    note: str | None = None


class AdjustmentCreate(BaseModel):
    account_id: int
    amount: str
    side: str = Field(pattern="^(DEBIT|CREDIT)$")
    title: str
    date: str | None = None
    note: str | None = None


class TransactionEdit(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    amount: str | None = None
    title: str | None = None
    date: str | None = None
    note: str | None = None


class ShareIn(BaseModel):
    friend_id: int
    amount: str


class SplitCreate(BaseModel):
    account_id: int
    category_id: int
    owner_share: str = Field(description="Your own share, major units -- can be '0'")
    friend_shares: list[ShareIn]
    title: str
    date: str | None = None
    note: str | None = None


class FrontedCreate(BaseModel):
    category_id: int
    friend_id: int
    amount: str
    title: str
    date: str | None = None
    note: str | None = None


class SplitEdit(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    owner_share: str | None = None
    friend_shares: list[ShareIn] | None = None
    friend_id: int | None = None
    amount: str | None = None
    title: str | None = None
    date: str | None = None
    note: str | None = None
    force: bool = False
    remove_settlements: bool = False


class SplitDeleteRequest(BaseModel):
    force: bool = False
    remove_settlements: bool = False


class SplitParticipantOut(BaseModel):
    friend_id: int | None
    friend_name: str
    share: MoneyOut
    is_owner: bool = False


class SplitCompositionOut(BaseModel):
    entry: EntryOut
    participants: list[SplitParticipantOut]


class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: str
    description: str | None = None
    date: str | None = None


class TransferEdit(BaseModel):
    from_account_id: int | None = None
    to_account_id: int | None = None
    amount: str | None = None
    description: str | None = None
    date: str | None = None


class SettlementCreate(BaseModel):
    friend_id: int
    account_id: int
    amount: str
    description: str | None = None
    date: str | None = None
    note: str | None = None


class SettlementEdit(BaseModel):
    friend_id: int | None = None
    account_id: int | None = None
    amount: str | None = None
    description: str | None = None
    date: str | None = None
    note: str | None = None
