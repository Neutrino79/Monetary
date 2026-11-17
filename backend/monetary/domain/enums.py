"""Canonical enum definitions for the double-entry ledger."""

from enum import Enum

from monetary.domain.exceptions import ValidationError


class AccountType(str, Enum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    EXPENSE = "EXPENSE"
    INCOME = "INCOME"
    DUE = "DUE"        # one per friend — running balance / counterparty account
    EQUITY = "EQUITY"  # system plug account, absorbs manual adjustments

    @property
    def normal_side(self) -> "Side":
        """Which side (DEBIT/CREDIT) increases this account type's balance."""
        return _NORMAL_SIDE[self]


class Side(str, Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


_NORMAL_SIDE = {
    AccountType.ASSET: Side.DEBIT,
    AccountType.EXPENSE: Side.DEBIT,
    AccountType.DUE: Side.DEBIT,       # receivable-like: positive = they owe you
    AccountType.LIABILITY: Side.CREDIT,
    AccountType.INCOME: Side.CREDIT,
    AccountType.EQUITY: Side.CREDIT,
}


class EntryType(str, Enum):
    NORMAL = "NORMAL"        # plain expense/income, no friend involved
    SPLIT = "SPLIT"          # owner paid, cost shared with one or more friends
    FRONTED = "FRONTED"      # a friend paid 100% on the owner's behalf
    REFUND = "REFUND"
    TRANSFER = "TRANSFER"
    ADJUSTMENT = "ADJUSTMENT"
    SETTLEMENT = "SETTLEMENT"
    REVERSAL = "REVERSAL"


class EntryStatus(str, Enum):
    POSTED = "POSTED"
    REVERSED = "REVERSED"


class LedgerMode(str, Enum):
    STRICT = "STRICT"   # immutable — corrections via reversal entries
    DIRECT = "DIRECT"   # mutable — corrections via in-place UPDATE/INSERT/DELETE


class UserStatus(str, Enum):
    """Lifecycle of a platform account (control database)."""
    PENDING_APPROVAL = "pending_approval"  # self-registered, waiting for a superuser
    ACTIVE = "active"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    PENDING_DELETE = "pending_delete"      # grace period before the ledger file is removed


class PlatformRole(str, Enum):
    USER = "user"
    SUPERUSER = "superuser"


def as_enum(enum_cls, value):
    """Coerce a raw string into the given Enum, raising a domain ValidationError on mismatch."""
    try:
        return enum_cls(str(value).upper())
    except (ValueError, AttributeError) as exc:
        valid = ", ".join(e.value for e in enum_cls)
        raise ValidationError(f"Invalid {enum_cls.__name__}: {value!r}. Must be one of: {valid}") from exc
