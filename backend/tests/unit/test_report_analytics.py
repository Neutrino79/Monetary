"""Report analytics: what counts as unusual, what limit would have fit, how a change splits."""
import pytest

from monetary.domain import report_analytics as ra


def test_mean_stdev_percentile_and_rolling_mean():
    assert ra.mean([2, 4, 6]) == 4 and ra.mean([]) == 0
    assert ra.stdev([2, 4, 4, 4, 5, 5, 7, 9]) == pytest.approx(2.0) and ra.stdev([]) == 0
    assert ra.percentile([10, 20, 30, 40], 0.5) == 25 and ra.percentile([5], 0.9) == 5 and ra.percentile([], 0.5) == 0
    assert ra.rolling_mean([10, 20, 30, 60], 3) == [10, 15, 20, 37]


def test_unusual_months_need_enough_history_and_real_spread():
    flat = [100] * 6
    assert ra.unusual_indexes(flat) == []
    assert ra.unusual_indexes([100, 900, 100]) == []                       # too few months to define normal
    spike = [100, 100, 110, 90, 100, 105, 95, 100, 100, 500]
    assert ra.unusual_indexes(spike) == [9]
    assert ra.unusual_indexes([100, 120, 90, 110, 95, 105]) == []


def test_slope_is_change_per_step():
    assert ra.slope([10, 20, 30, 40]) == pytest.approx(10)
    assert ra.slope([5, 5, 5]) == 0 and ra.slope([7]) == 0
    assert ra.slope([40, 30, 20]) == pytest.approx(-10)


def test_usual_range_and_classify_with_a_pad():
    assert ra.usual_range([1, 2, 3]) is None
    usual = ra.usual_range([100_000, 110_000, 120_000, 130_000, 140_000])
    assert usual == (108_000, 120_000, 132_000)
    assert ra.classify(120_000, usual) == "normal"
    assert ra.classify(132_000 + 9_000, usual) == "normal"                 # inside the pad: not above
    assert ra.classify(132_000 + 20_000, usual) == "above"
    assert ra.classify(108_000 - 20_000, usual) == "below"
    assert ra.classify(5, None) is None
    quiet = (0, 1_000, 2_000)                                              # tiny category: the floor pad applies
    assert ra.classify(9_000, quiet) == "normal" and ra.classify(13_000, quiet) == "above"


def test_pct_change():
    assert ra.pct_change(150, 100) == 50.0 and ra.pct_change(50, 100) == -50.0 and ra.pct_change(1, 0) is None


@pytest.mark.parametrize("count_a,total_a,count_b,total_b", [(23, 8_980, 18, 7_600), (2, 1_340, 2, 5_830), (0, 0, 4, 400), (3, 90, 0, 0), (5, 200, 9, 450)])
def test_volume_and_ticket_always_add_up_to_the_change(count_a, total_a, count_b, total_b):
    volume, ticket = ra.volume_and_ticket(count_a, total_a, count_b, total_b)
    assert volume + ticket == total_a - total_b


def test_volume_and_ticket_split_the_cause():
    assert ra.volume_and_ticket(10, 1_000, 5, 500) == (500, 0)             # twice as many, same price each
    assert ra.volume_and_ticket(5, 1_000, 5, 500) == (0, 500)              # same count, dearer each time
    assert ra.volume_and_ticket(0, 0, 4, 400) == (-400, 0)                 # stopped buying: all volume


def test_round_up_to_a_tidy_limit():
    assert ra.round_up(3_001, 500) == 3_500 and ra.round_up(3_000, 500) == 3_000 and ra.round_up(1, 500) == 500


def test_budget_that_keeps_running_over_should_be_raised():
    series = [2_600, 3_100, 2_400, 2_200, 2_900, 2_500, 2_800, 3_300, 3_000, 3_900, 3_700, 4_890]
    s = ra.suggest_budget(series, 3_000, step=500)
    assert s["action"] == "raise" and s["limit_points"] == 4_000 and s["months_over"] == 5 and s["held"] == 7
    assert s["recent_overshoot_points"] == 800


def test_roomy_budget_is_tightened_and_a_fitting_one_kept():
    roomy = [5_600, 6_100, 5_300, 5_100, 5_900, 5_500, 5_800, 5_600, 6_000, 5_700, 5_800, 5_340]
    s = ra.suggest_budget(roomy, 8_000, step=500)
    assert s["action"] == "tighten" and s["limit_points"] == 7_000 and s["months_over"] == 0
    snug = [8_000, 9_800, 7_900, 7_400, 8_200, 8_000, 8_600, 7_900, 8_400, 8_100, 8_300, 9_120]
    assert ra.suggest_budget(snug, 10_000, step=500)["action"] == "keep"


def test_budget_with_too_little_history_is_left_alone():
    s = ra.suggest_budget([5_000, 9_000], 3_000, step=500)
    assert s["action"] == "keep" and s["limit_points"] == 3_000 and s["months"] == 2 and s["months_over"] == 2


def test_lumpy_spending_is_one_with_a_few_huge_months():
    assert ra.is_lumpy([100, 120, 90, 110, 4_000, 100]) is True
    assert ra.is_lumpy([100, 120, 90, 110, 200, 100]) is False
    assert ra.is_lumpy([1, 99_999]) is False                               # too short to call


def test_forecast_repeats_last_year_with_a_year_of_history_and_averages_otherwise():
    year = list(range(1, 13))
    method, fc = ra.forecast_series(year, 12)
    assert method == "seasonal" and fc == year                              # next month = the same month a year ago
    assert ra.forecast_series(list(range(100, 112)) + [5], 3)[1] == list(range(101, 104))   # uses only the latest 12
    method, fc = ra.forecast_series([10, 20, 30], 4)
    assert method == "average" and fc == [20] * 4
    assert ra.forecast_series([10, 20], 4) == ("none", [])


def test_spread_widens_with_the_square_root_of_time():
    s = ra.spread([100, 200, 100, 200], 4)                                  # standard deviation 50
    assert s == [50, 71, 87, 100]
    assert ra.spread([5, 5, 5], 3) == [0, 0, 0]
