import pytest

from monetary.domain.enums import AccountType, LedgerMode, Side, as_enum
from monetary.domain.exceptions import ValidationError


@pytest.mark.parametrize("acct,side", [
    (AccountType.ASSET, Side.DEBIT), (AccountType.EXPENSE, Side.DEBIT), (AccountType.DUE, Side.DEBIT),
    (AccountType.LIABILITY, Side.CREDIT), (AccountType.INCOME, Side.CREDIT), (AccountType.EQUITY, Side.CREDIT),
])
def test_normal_sides(acct, side):
    assert acct.normal_side == side


def test_as_enum_is_case_insensitive():
    assert as_enum(LedgerMode, "strict") is LedgerMode.STRICT


@pytest.mark.parametrize("bad", ["nope", "", None, 5])
def test_as_enum_rejects_garbage(bad):
    with pytest.raises(ValidationError, match="Must be one of"):
        as_enum(LedgerMode, bad)
