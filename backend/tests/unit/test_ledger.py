import pytest

from monetary.domain.enums import EntryType, Side
from monetary.domain.exceptions import ValidationError
from monetary.domain.ledger import Leg, LedgerIntent, assert_balanced
from monetary.domain.money import Money


def m(points, cur="INR"):
    return Money(points, cur)


def intent(legs, desc="x", currency="INR"):
    return LedgerIntent(description=desc, entry_type=EntryType.NORMAL, currency_code=currency,
                        entry_date="2026-01-01T00:00:00+00:00", legs=legs)


def test_balanced_intent_is_accepted():
    intent([Leg(1, Side.DEBIT, m(100)), Leg(2, Side.CREDIT, m(100))])


def test_multi_leg_balanced():
    intent([Leg(1, Side.CREDIT, m(500)), Leg(2, Side.DEBIT, m(150)), Leg(3, Side.DEBIT, m(350))])


def test_unbalanced_rejected():
    with pytest.raises(ValidationError, match="does not balance"):
        intent([Leg(1, Side.DEBIT, m(100)), Leg(2, Side.CREDIT, m(99))])


def test_single_leg_rejected():
    with pytest.raises(ValidationError, match="two legs"):
        intent([Leg(1, Side.DEBIT, m(100))])


def test_currency_mismatch_rejected():
    with pytest.raises(ValidationError, match="currency"):
        intent([Leg(1, Side.DEBIT, m(100, "USD")), Leg(2, Side.CREDIT, m(100, "USD"))])


@pytest.mark.parametrize("desc", ["", "   "])
def test_blank_description_rejected(desc):
    with pytest.raises(ValidationError, match="description"):
        intent([Leg(1, Side.DEBIT, m(1)), Leg(2, Side.CREDIT, m(1))], desc=desc)


def test_assert_balanced_direct():
    assert_balanced([Leg(1, Side.DEBIT, m(5)), Leg(2, Side.CREDIT, m(5))], "INR")
