"""Shared response shapes used across every router."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class MoneyOut(BaseModel):
    """A signed, human-readable rendering of an amount. `major` is a decimal
    string (never a float, to avoid any binary-float rounding ambiguity in
    the API contract); `points` is the same value as an integer, for clients
    that want exact arithmetic without string parsing."""
    points: int
    major: str
    currency: str


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class MessageOut(BaseModel):
    detail: str
