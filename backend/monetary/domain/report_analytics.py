"""Report analytics: pure arithmetic over monthly series, no I/O.

Money here is integer points. Every function takes plain lists and returns plain values so the
rules (what counts as an unusual month, what limit would have fit, how a change splits into
"more often" and "bigger each time") are testable without a database and identical for every
caller. Series are oldest first.
"""

from __future__ import annotations

from math import sqrt
from statistics import median

# An "unusual" month is more than this many standard deviations from the typical month (about 1 in 12 ordinary months) ...
UNUSUAL_Z = 1.75
# ... and needs at least this many months to say what typical is.
MIN_MONTHS_FOR_NORMAL = 4
# A category is only "above/below usual" when it is outside its range by more than this much,
# so a quiet category does not flip on small change (100.00 in major units).
MIN_PAD_POINTS = 10_000
PAD_FRACTION = 0.08


def mean(values: list[int]) -> float:
    return sum(values) / len(values) if values else 0.0


def stdev(values: list[int]) -> float:
    """Population standard deviation (the series is the whole window, not a sample of it)."""
    if not values:
        return 0.0
    m = mean(values)
    return sqrt(sum((v - m) ** 2 for v in values) / len(values))


def percentile(values: list[int], fraction: float) -> float:
    """Linear-interpolated percentile; `fraction` is 0..1."""
    if not values:
        return 0.0
    ordered = sorted(values)
    pos = fraction * (len(ordered) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def rolling_mean(values: list[int], window: int = 3) -> list[int]:
    """Trailing mean; the first months average over what exists so the line starts at month one."""
    out = []
    for i in range(len(values)):
        chunk = values[max(0, i - window + 1): i + 1]
        out.append(round(sum(chunk) / len(chunk)))
    return out


def unusual_indexes(values: list[int], threshold: float = UNUSUAL_Z) -> list[int]:
    """Indexes more than `threshold` standard deviations from the mean. Empty when the window is
    too short, or perfectly flat, to define normal."""
    if len(values) < MIN_MONTHS_FOR_NORMAL:
        return []
    m, sd = mean(values), stdev(values)
    if sd == 0:
        return []
    return [i for i, v in enumerate(values) if abs(v - m) / sd > threshold]


def slope(values: list[int]) -> float:
    """Least-squares change per step (points a month for a monthly series)."""
    n = len(values)
    if n < 2:
        return 0.0
    mx, my = (n - 1) / 2, mean(values)
    den = sum((i - mx) ** 2 for i in range(n))
    return sum((i - mx) * (v - my) for i, v in enumerate(values)) / den


def usual_range(values: list[int], low: float = 0.2, high: float = 0.8) -> tuple[int, int, int] | None:
    """(low, median, high) of the earlier months: what a normal month looks like. None when there
    are too few months to say."""
    if len(values) < MIN_MONTHS_FOR_NORMAL:
        return None
    return round(percentile(values, low)), round(percentile(values, 0.5)), round(percentile(values, high))


def classify(current: int, usual: tuple[int, int, int] | None) -> str | None:
    """'above', 'below' or 'normal' against the usual range, with a pad so small moves stay normal."""
    if usual is None:
        return None
    low, mid, high = usual
    pad = max(round(mid * PAD_FRACTION), MIN_PAD_POINTS)
    if current > high + pad:
        return "above"
    if current < low - pad:
        return "below"
    return "normal"


def pct_change(new: float, old: float) -> float | None:
    """Percent change from `old` to `new`, one decimal; None when there was nothing before."""
    if old == 0:
        return None
    return round((new - old) / old * 100, 1)


def volume_and_ticket(count_a: int, total_a: int, count_b: int, total_b: int) -> tuple[int, int]:
    """Split the change from period B to period A into (volume, ticket) so that
    volume + ticket == total_a - total_b exactly.

    volume: buying more or less often, priced at B's average purchase.
    ticket: paying more or less each time, over A's purchases.
    A category with no purchases on one side is all volume.
    """
    change = total_a - total_b
    if count_a <= 0 or count_b <= 0:
        return change, 0
    avg_b = total_b / count_b
    volume = round((count_a - count_b) * avg_b)
    return volume, change - volume


def round_up(points: float, step: int) -> int:
    """Round up to a multiple of `step` (a tidy limit such as 500.00)."""
    return int(-(-points // step) * step)


def suggest_budget(series: list[int], limit: int, *, step: int = 50_000) -> dict:
    """Judge a budget against the months it has actually run.

    `series` is spending per complete month, oldest first. The suggestion is the limit that would
    have held in about 10 of 12 months ('raise'), a tighter one when you use well under it and
    never go over ('tighten'), or the current one ('keep').
    """
    months = len(series)
    over = sum(1 for v in series if v > limit)
    result = {"action": "keep", "limit_points": limit, "months": months, "months_over": over,
              "held": months - over, "typical_pct": 0.0, "recent_overshoot_points": 0}
    if months < 3 or limit <= 0:
        return result
    typical = percentile(series, 0.5)
    result["typical_pct"] = round(typical / limit * 100, 1)
    recent = median(series[-4:])
    result["recent_overshoot_points"] = max(0, round(recent - limit))
    fit = round_up(percentile(series, 0.83) * 1.03, step)
    if over >= 3 and fit > limit * 1.1:
        result.update(action="raise", limit_points=fit)
    elif over == 0 and months >= 6 and typical / limit < 0.75:
        tight = round_up(percentile(series, 0.9) * 1.1, step)
        if tight < limit:
            result.update(action="tighten", limit_points=tight)
    return result


def is_lumpy(series: list[int]) -> bool:
    """True when a few big months dominate (the biggest is over three times the median month)."""
    if len(series) < MIN_MONTHS_FOR_NORMAL:
        return False
    typical = median(series)
    return max(series) > 3 * max(typical, 1)


def forecast_series(history: list[int], horizon: int = 12) -> tuple[str, list[int]]:
    """Expected value for each of the next `horizon` months and the method used.

    With a year of history each coming month repeats the same month a year earlier ('seasonal'), so
    December's big bill shows up again. With 3-11 months it falls back to their average
    ('average'). Fewer than 3 months gives ('none', []).
    """
    if len(history) >= 12:
        last_year = history[-12:]
        return "seasonal", [last_year[i % 12] for i in range(horizon)]
    if len(history) >= 3:
        avg = round(mean(history))
        return "average", [avg] * horizon
    return "none", []


def spread(history: list[int], steps: int) -> list[int]:
    """One standard deviation of the cumulative total after 1..steps months, assuming months vary
    independently: the likely range of a running total widens with the square root of time."""
    sd = stdev(history)
    return [round(sd * sqrt(t)) for t in range(1, steps + 1)]
