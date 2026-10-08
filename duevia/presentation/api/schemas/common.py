"""Shared response shapes used across every router.

Every API model inherits `ApiModel`: field names are snake_case in Python but
camelCase on the wire (`currencyCode`). Requests may use either spelling
(`populate_by_name`), so server-side tests and scripts can stay snake_case.
"""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class MoneyOut(ApiModel):
    """A signed, human-readable rendering of an amount. `major` is a decimal
    string (never a float, to avoid any binary-float rounding ambiguity in
    the API contract); `points` is the same value as an integer, for clients
    that want exact arithmetic without string parsing."""
    points: int
    major: str
    currency: str


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class MessageOut(ApiModel):
    detail: str
