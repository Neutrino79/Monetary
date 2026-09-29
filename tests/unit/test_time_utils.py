import pytest

from duevia.domain import time_utils as tu
from duevia.domain.exceptions import ValidationError


def test_local_to_utc_kolkata():
    assert tu.parse_local_to_utc_iso("2026-09-01 10:30", "Asia/Kolkata") == "2026-09-01T05:00:00+00:00"


def test_date_only_is_local_midnight():
    assert tu.parse_local_to_utc_iso("2026-09-01", "Asia/Kolkata") == "2026-08-31T18:30:00+00:00"


def test_no_timezone_means_utc():
    assert tu.parse_local_to_utc_iso("2026-09-01 10:30:15", None) == "2026-09-01T10:30:15+00:00"


@pytest.mark.parametrize("bad", ["", "yesterday", "2026-02-30", "01-09-2026", "2026-09-01T10:30"])
def test_bad_dates_rejected(bad):
    with pytest.raises(ValidationError):
        tu.parse_local_to_utc_iso(bad, None)


@pytest.mark.parametrize("tz", ["Mars/Base", "/etc/passwd", "../x", "America"])
def test_bad_timezones_are_validation_errors_not_crashes(tz):
    with pytest.raises(ValidationError):
        tu.validate_timezone(tz)


def test_display_conversion():
    assert tu.utc_iso_to_local_display("2026-08-31T18:30:00+00:00", "Asia/Kolkata") == "2026-09-01 00:00"
    assert tu.utc_iso_to_local_display("2026-08-31T18:30:00", None) == "2026-08-31 18:30"  # naive = UTC


def test_month_bounds_are_local_months_in_utc():
    assert tu.month_bounds_utc_iso("Asia/Kolkata", 2026, 9) == (
        "2026-08-31T18:30:00+00:00", "2026-09-30T18:30:00+00:00")


def test_month_bounds_december_rolls_year():
    assert tu.month_bounds_utc_iso(None, 2026, 12) == ("2026-12-01T00:00:00+00:00", "2027-01-01T00:00:00+00:00")


def test_last_n_months_across_year_boundary(monkeypatch):
    from duevia.application import trends_service
    monkeypatch.setattr(tu, "current_year_month", lambda tz: (2026, 1))
    assert trends_service._last_n_months(None, 3) == [(2025, 11), (2025, 12), (2026, 1)]
    assert trends_service._last_n_months(None, 14)[0] == (2024, 12)
