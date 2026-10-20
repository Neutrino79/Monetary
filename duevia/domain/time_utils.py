"""Timestamp handling. Everything is stored in UTC; the owner's optional timezone
is used only for display and for monthly budget period boundaries."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from duevia.domain.exceptions import ValidationError

_DATE_FORMATS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"]


def _tz(tz_name: str | None):
    if not tz_name:
        return timezone.utc
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise ValidationError(f"Unknown timezone: {tz_name!r}") from exc


def validate_timezone(tz_name: str | None) -> None:
    if tz_name:
        _tz(tz_name)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_local_to_utc_iso(date_str: str, tz_name: str | None) -> str:
    s = date_str.strip()
    dt = None
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            break
        except ValueError:
            continue
    if dt is None:
        raise ValidationError(
            f"Unrecognized date/time {date_str!r}. Use 'YYYY-MM-DD', "
            "'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD HH:MM:SS'."
        )
    local_dt = dt.replace(tzinfo=_tz(tz_name))
    return local_dt.astimezone(timezone.utc).isoformat()


def utc_iso_to_local_display(utc_iso: str, tz_name: str | None) -> str:
    dt = datetime.fromisoformat(utc_iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local_dt = dt.astimezone(_tz(tz_name))
    return local_dt.strftime("%Y-%m-%d %H:%M")


def utc_iso_to_local_date(utc_iso: str, tz_name: str | None) -> str:
    """'YYYY-MM-DD' of an instant in the owner's timezone (what a calendar shows)."""
    dt = datetime.fromisoformat(utc_iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_tz(tz_name)).strftime("%Y-%m-%d")


def local_today(tz_name: str | None) -> str:
    return datetime.now(_tz(tz_name)).strftime("%Y-%m-%d")


def next_local_day_start_utc_iso(date_str: str, tz_name: str | None) -> str:
    """UTC instant of the start of the day AFTER `date_str` (local) -- the
    exclusive upper bound that makes a 'to' date inclusive."""
    first = parse_local_to_utc_iso(date_str, tz_name)
    local = datetime.fromisoformat(first).astimezone(_tz(tz_name))
    nxt = datetime(local.year, local.month, local.day, tzinfo=_tz(tz_name)) + timedelta(days=1)
    return datetime(nxt.year, nxt.month, nxt.day, tzinfo=_tz(tz_name)).astimezone(timezone.utc).isoformat()


def current_year_month(tz_name: str | None) -> tuple[int, int]:
    now_local = datetime.now(_tz(tz_name))
    return now_local.year, now_local.month


def month_bounds_utc_iso(tz_name: str | None, year: int, month: int) -> tuple[str, str]:
    tz = _tz(tz_name)
    start_local = datetime(year, month, 1, tzinfo=tz)
    if month == 12:
        end_local = datetime(year + 1, 1, 1, tzinfo=tz)
    else:
        end_local = datetime(year, month + 1, 1, tzinfo=tz)
    return (
        start_local.astimezone(timezone.utc).isoformat(),
        end_local.astimezone(timezone.utc).isoformat(),
    )
