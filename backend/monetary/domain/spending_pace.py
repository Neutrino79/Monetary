"""Month-end spending projection: pure arithmetic, no I/O.

Money here is integer points. A month is a list of cumulative spend per day
(index 0 = day 1). The projection answers "where will this month probably end?"
from how earlier months built up *after* the same day -- not from a plain daily
average, because rent and bills land early and would make an average overshoot.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median

# Fewer earlier months than this and the history is too thin to trust: fall back to a plain pace line.
MIN_HISTORY_MONTHS = 3
# From this many months the band is the middle half of history; below it, the full min..max.
PERCENTILE_BAND_FROM = 5
# Too early in the month for either method to mean anything.
MIN_ELAPSED_DAYS = 3


@dataclass(frozen=True)
class ProjectedDay:
    day: int
    expected: int
    low: int
    high: int


@dataclass(frozen=True)
class Projection:
    method: str            # "history" or "pace"
    basis_months: int      # earlier months the estimate learned from (0 for "pace")
    days: list[ProjectedDay]   # elapsed+1 .. days_in_month

    @property
    def end(self) -> ProjectedDay:
        return self.days[-1]


def cumulative(daily: list[int]) -> list[int]:
    out, running = [], 0
    for amount in daily:
        running += amount
        out.append(running)
    return out


def _at(series: list[int], day: int) -> int:
    """Cumulative value on `day` (1-based); a month shorter than `day` stays at its final total."""
    return series[min(day, len(series)) - 1]


def _percentile(values: list[int], fraction: float) -> int:
    ordered = sorted(values)
    pos = fraction * (len(ordered) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(ordered) - 1)
    return round(ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo))


def project_month_end(*, so_far: list[int], days_in_month: int, history: list[list[int]]) -> Projection | None:
    """`so_far` is this month's cumulative spend for each elapsed day; `history` is the full-month
    cumulative series of earlier months (empty months are ignored). Returns None when the month is
    over, has barely started, or there is nothing to learn from."""
    elapsed = len(so_far)
    if elapsed >= days_in_month or elapsed < MIN_ELAPSED_DAYS:
        return None
    spent = so_far[-1]
    past = [h for h in history if h and h[-1] > 0]
    remaining_days = range(elapsed + 1, days_in_month + 1)

    if len(past) < MIN_HISTORY_MONTHS:
        if spent <= 0:
            return None
        days = []
        for d in remaining_days:
            value = round(spent / elapsed * d)
            days.append(ProjectedDay(d, value, value, value))
        return Projection("pace", 0, days)

    days = []
    for d in remaining_days:
        # what each earlier month added between today and day d
        added = [_at(h, d) - _at(h, elapsed) for h in past]
        if len(past) >= PERCENTILE_BAND_FROM:
            low, high = _percentile(added, 0.25), _percentile(added, 0.75)
        else:
            low, high = min(added), max(added)
        expected = spent + round(median(added))
        # the typical path must sit inside its own band
        days.append(ProjectedDay(d, expected, spent + min(low, round(median(added))), spent + max(high, round(median(added)))))
    return Projection("history", len(past), days)
