"""Money value object.

A posting's debit_amount/credit_amount is always a non-negative magnitude — the
two-column debit/credit model (§3.3 of the architecture plan) means there is
never a signed monetary amount stored anywhere. Money enforces that directly.

Computed *balances* (e.g. a DUE account showing "-50" = you owe 50) are signed
integers for display purposes only — see format_signed() below — never a Money
value, since Money's whole point is "this is a real magnitude of currency."
"""

from __future__ import annotations

from dataclasses import dataclass

_MAX_AMOUNT_STR_LEN = 32  # guards against absurdly long input before int() parsing


class MoneyError(ValueError):
    pass


@dataclass(frozen=True)
class Money:
    points: int
    currency: str

    def __post_init__(self):
        if not isinstance(self.points, int) or isinstance(self.points, bool):
            raise MoneyError("Money must be an integer number of points (no floats).")
        if self.points < 0:
            raise MoneyError("Money must be a non-negative magnitude.")
        object.__setattr__(self, "currency", self.currency.strip().upper())
        if not self.currency:
            raise MoneyError("Currency code is required.")

    @staticmethod
    def from_major_units(amount_str: str, currency: str, allow_zero: bool = False) -> "Money":
        s = str(amount_str).strip()
        if not s:
            raise MoneyError("Amount is required.")
        if len(s) > _MAX_AMOUNT_STR_LEN:
            raise MoneyError("Amount is too long to be a valid monetary value.")
        if s.startswith("-"):
            raise MoneyError("Amount must be positive.")
        if s.startswith("+"):
            s = s[1:]
        if "." in s:
            whole, frac = s.split(".", 1)
            if len(frac) > 2:
                raise MoneyError(
                    f"Amount {amount_str!r} has more than 2 decimal digits; "
                    "V1 assumes 2-decimal minor units."
                )
            frac = (frac + "00")[:2]
        else:
            whole, frac = s, "00"
        whole = whole or "0"
        # ASCII digits only: str.isdigit() also accepts e.g. '²' (which int() then
        # rejects with a raw ValueError) and non-ASCII digit scripts.
        if not (whole.isascii() and frac.isascii() and whole.isdigit() and frac.isdigit()):
            raise MoneyError(f"Invalid amount: {amount_str!r}")
        points = int(whole) * 100 + int(frac)
        if points == 0 and not allow_zero:
            raise MoneyError("Amount must be greater than zero.")
        return Money(points, currency)

    def to_major_units_str(self) -> str:
        return f"{self.points // 100}.{self.points % 100:02d}"

    def __add__(self, other: "Money") -> "Money":
        self._check_currency(other)
        return Money(self.points + other.points, self.currency)

    def __sub__(self, other: "Money") -> "Money":
        self._check_currency(other)
        return Money(self.points - other.points, self.currency)

    def __le__(self, other: "Money") -> bool:
        self._check_currency(other)
        return self.points <= other.points

    def __lt__(self, other: "Money") -> bool:
        self._check_currency(other)
        return self.points < other.points

    def _check_currency(self, other: "Money") -> None:
        if not isinstance(other, Money):
            raise MoneyError("Can only operate on another Money value.")
        if self.currency != other.currency:
            raise MoneyError(f"Currency mismatch: {self.currency} vs {other.currency}")

    def __str__(self) -> str:
        return f"{self.currency} {self.to_major_units_str()}"


def format_signed(points: int, currency: str) -> str:
    """Format a signed integer (a computed balance) for display, e.g. -5000 -> '-INR 50.00'."""
    sign = "-" if points < 0 else ""
    p = abs(points)
    return f"{sign}{currency} {p // 100}.{p % 100:02d}"
