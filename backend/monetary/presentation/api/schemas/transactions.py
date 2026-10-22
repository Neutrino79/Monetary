from __future__ import annotations

from pydantic import AliasChoices, Field

from monetary.presentation.api.schemas.common import ApiModel, MoneyOut


class PostingOut(ApiModel):
    account_id: int
    account_name: str
    account_type: str
    side: str  # DEBIT | CREDIT
    amount: MoneyOut


class EntryOut(ApiModel):
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


class ExpenseCreate(ApiModel):
    account_id: int
    category_id: int
    amount: str = Field(description="Major units, e.g. '249.99'")
    title: str = Field(min_length=1, max_length=500)
    date: str | None = Field(default=None, description="'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM', local time")
    note: str | None = Field(default=None, max_length=2000)


class IncomeCreate(ExpenseCreate):
    pass


class RefundCreate(ApiModel):
    for_entry_id: int
    amount: str
    account_id: int | None = None
    category_id: int | None = None
    title: str | None = Field(default=None, max_length=500)
    date: str | None = None
    note: str | None = Field(default=None, max_length=2000)


class AdjustmentCreate(ApiModel):
    account_id: int
    amount: str
    side: str = Field(pattern="^(DEBIT|CREDIT)$")
    title: str = Field(min_length=1, max_length=500)
    date: str | None = None
    note: str | None = Field(default=None, max_length=2000)


class TransactionEdit(ApiModel):
    account_id: int | None = None
    category_id: int | None = None
    amount: str | None = None
    title: str | None = Field(default=None, max_length=500)
    date: str | None = None
    note: str | None = Field(default=None, max_length=2000)


class ShareIn(ApiModel):
    friend_id: int
    amount: str


class SplitCreate(ApiModel):
    account_id: int
    category_id: int
    owner_share: str = Field(description="Your own share, major units -- can be '0'")
    friend_shares: list[ShareIn] = Field(min_length=1)
    title: str = Field(min_length=1, max_length=500)
    date: str | None = None
    note: str | None = Field(default=None, max_length=2000)


class FrontedCreate(ApiModel):
    category_id: int
    friend_id: int
    amount: str
    title: str = Field(min_length=1, max_length=500)
    date: str | None = None
    note: str | None = Field(default=None, max_length=2000)


class SplitEdit(ApiModel):
    account_id: int | None = None
    category_id: int | None = None
    owner_share: str | None = None
    friend_shares: list[ShareIn] | None = None
    friend_id: int | None = None
    amount: str | None = None
    title: str | None = Field(default=None, max_length=500)
    date: str | None = None
    note: str | None = Field(default=None, max_length=2000)
    force: bool = False
    remove_settlements: bool = False


class SplitDeleteRequest(ApiModel):
    force: bool = False
    remove_settlements: bool = False


class SplitParticipantOut(ApiModel):
    friend_id: int | None
    friend_name: str
    share: MoneyOut
    is_owner: bool = False


class SplitCompositionOut(ApiModel):
    entry: EntryOut
    participants: list[SplitParticipantOut]


class TransferCreate(ApiModel):
    from_account_id: int
    to_account_id: int
    amount: str
    description: str | None = Field(default=None, max_length=500)
    date: str | None = None


class TransferEdit(ApiModel):
    from_account_id: int | None = None
    to_account_id: int | None = None
    amount: str | None = None
    description: str | None = Field(default=None, max_length=500)
    date: str | None = None


class SettlementCreate(ApiModel):
    friend_id: int
    account_id: int
    amount: str
    description: str | None = Field(default=None, max_length=500)
    date: str | None = None
    note: str | None = Field(default=None, max_length=2000)


class SettlementEdit(ApiModel):
    friend_id: int | None = None
    account_id: int | None = None
    amount: str | None = None
    description: str | None = Field(default=None, max_length=500)
    date: str | None = None
    note: str | None = Field(default=None, max_length=2000)


# --------------------------------------------------------------------------- #
# Flat transaction API (what the web app uses)
# --------------------------------------------------------------------------- #
class SplitShareIn(ApiModel):
    friend_id: int
    share: str = Field(description="Major units, e.g. '350.00'")


class SplitShareOut(ApiModel):
    friend_id: int
    share: MoneyOut


class TransactionCreate(ApiModel):
    type: str = Field(description="income | expense | transfer | split | fronted | settlement | refund | adjustment")
    description: str = Field(min_length=1, max_length=500, validation_alias=AliasChoices("description", "title"))
    amount: str = Field(description="Major units. For a split this is the TOTAL bill.")
    date: str | None = Field(default=None, description="'YYYY-MM-DD' (owner's local date); defaults to now")
    memo: str | None = Field(default=None, max_length=2000, validation_alias=AliasChoices("memo", "note"))
    account_id: int | None = Field(default=None, description="Paying/receiving account; the FROM account of a transfer")
    to_account_id: int | None = None
    category_id: int | None = None
    friend_id: int | None = None
    direction: str | None = Field(default=None, description="settlement: receive|pay (verified); adjustment: increase|decrease")
    your_share: str | None = Field(default=None, description="split: your own share (can be '0')")
    splits: list[SplitShareIn] | None = None
    refund_of_id: int | None = None


class TransactionPatch(ApiModel):
    """Partial update: only the keys you send change. An explicit null `memo`
    clears it. Type can't change."""
    description: str | None = Field(default=None, min_length=1, max_length=500,
                                    validation_alias=AliasChoices("description", "title"))
    amount: str | None = None
    date: str | None = None
    memo: str | None = Field(default=None, max_length=2000, validation_alias=AliasChoices("memo", "note"))
    account_id: int | None = None
    to_account_id: int | None = None
    category_id: int | None = None
    friend_id: int | None = None
    direction: str | None = None
    your_share: str | None = None
    splits: list[SplitShareIn] | None = None
    force: bool = False
    remove_settlements: bool = False


class TransactionOut(ApiModel):
    id: int
    type: str
    description: str
    memo: str | None
    date: str = Field(description="'YYYY-MM-DD' in the owner's timezone")
    currency: str
    status: str = Field(description="posted | reversed")
    amount: MoneyOut
    account_id: int | None
    to_account_id: int | None
    category_id: int | None
    friend_id: int | None
    direction: str | None
    your_share: MoneyOut | None
    splits: list[SplitShareOut] | None
    refund_of_id: int | None
    correction_of: int | None = Field(description="STRICT mode: the entry this one replaced")
    replaced_by: int | None = Field(description="STRICT mode: the entry that replaced this one")
    created_at: str
    updated_at: str
    unpaid: MoneyOut | None = Field(default=None, description="Friend-fronted only: the part not repaid to the friend yet")
    group_key: str | None = Field(default=None, description="Only when listed with `groupBy`: the group this row is in")


class GroupTotalOut(ApiModel):
    currency: str
    money_in: MoneyOut = Field(description="Income and refunds in the group")
    money_out: MoneyOut = Field(description="Expenses in the group")


class TransactionGroupOut(ApiModel):
    key: str = Field(description="Matches `groupKey` on the rows. date: YYYY-MM-DD, month: YYYY-MM, "
                                 "type: the flat type, category/account: the id ('' = none)")
    label: str = Field(description="Display name; for date/month/type the key itself")
    count: int
    totals: list[GroupTotalOut] = Field(description="One entry per currency")


class TransactionGroupsOut(ApiModel):
    group_by: str
    groups: list[TransactionGroupOut]
