import pytest

from monetary.domain.money import Money, MoneyError, format_signed


@pytest.mark.parametrize("text,points", [
    ("0.01", 1), ("1", 100), ("1.5", 150), ("1.50", 150), ("249.99", 24999), (" 12.5 ", 1250),
    ("+5", 500), (".5", 50), ("5.", 500), ("50000.00", 5_000_000), ("0000123.4", 12340),
])
def test_parses_valid_amounts(text, points):
    assert Money.from_major_units(text, "INR").points == points


@pytest.mark.parametrize("text", [
    "", "   ", "-1", "0", "0.00", "1.234", "abc", "1,000", "1e3", "1.2.3", "--1", "$5",
    "²", "١٢",          # non-ASCII digits (str.isdigit() accepts '²'; int() then explodes)
    "9" * 33,            # length guard
])
def test_rejects_invalid_amounts(text):
    with pytest.raises(MoneyError):
        Money.from_major_units(text, "INR")


def test_allow_zero_only_when_asked():
    assert Money.from_major_units("0", "INR", allow_zero=True).points == 0
    with pytest.raises(MoneyError):
        Money.from_major_units("0", "INR")


def test_constructor_validation():
    for bad in (True, 1.5, "10", -1):
        with pytest.raises(MoneyError):
            Money(bad, "INR")
    with pytest.raises(MoneyError):
        Money(1, "  ")
    assert Money(1, " inr ").currency == "INR"


def test_arithmetic_and_ordering():
    a, b = Money(500, "INR"), Money(200, "INR")
    assert (a + b).points == 700 and (a - b).points == 300
    assert b < a and b <= a and not a < b
    with pytest.raises(MoneyError):
        b - a                      # would be negative
    with pytest.raises(MoneyError):
        a + Money(1, "USD")        # currency mismatch
    with pytest.raises(MoneyError):
        a < Money(1, "USD")


def test_string_forms():
    assert str(Money(12345, "INR")) == "INR 123.45"
    assert Money(5, "INR").to_major_units_str() == "0.05"
    assert format_signed(-5000, "INR") == "-INR 50.00"
    assert format_signed(0, "INR") == "INR 0.00"
