"""Small shared converters from raw repo rows / domain values into API schema
objects, so every router formats money and rows the same way."""

from __future__ import annotations

from duevia.domain.money import Money, format_signed
from duevia.presentation.api.schemas.common import MoneyOut


def money_out(points: int, currency: str) -> MoneyOut:
    return MoneyOut(points=points, major=format_signed(points, currency), currency=currency)


def money_value_out(m: Money) -> MoneyOut:
    return MoneyOut(points=m.points, major=m.to_major_units_str(), currency=m.currency)
