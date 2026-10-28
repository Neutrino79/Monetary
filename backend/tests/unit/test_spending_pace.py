"""The month-end projection: learned from earlier months, with sensible fallbacks."""
from monetary.domain.spending_pace import cumulative, project_month_end


def month(*daily, days=10):
    """A cumulative series for a 10-day month from the first few daily amounts (the rest are quiet days)."""
    return cumulative(list(daily) + [0] * (days - len(daily)))


def test_cumulative():
    assert cumulative([5, 0, 10]) == [5, 5, 15]
    assert cumulative([]) == []


def test_history_projection_adds_what_earlier_months_added_after_today():
    # three earlier months each spend 100 on days 6-10 on top of whatever came before
    history = [month(500, 0, 0, 0, 0, 100, 0, 0, 0, 0), month(900, 0, 0, 0, 0, 100, 0, 0, 0, 0), month(300, 0, 0, 0, 0, 100, 0, 0, 0, 0)]
    p = project_month_end(so_far=cumulative([700, 0, 0, 0, 0]), days_in_month=10, history=history)
    assert p.method == "history" and p.basis_months == 3
    assert [d.day for d in p.days] == [6, 7, 8, 9, 10]
    assert p.end.expected == 800 and p.end.low == 800 and p.end.high == 800


def test_front_loaded_rent_does_not_inflate_the_estimate():
    # a plain average of 710/5 days would project 1420; history says the rest of the month is small
    history = [month(600, 10, 10, 10, 10, 20, 20, 20, 20, 20)] * 3
    p = project_month_end(so_far=cumulative([700, 10, 0, 0, 0]), days_in_month=10, history=history)
    assert p.end.expected == 710 + 100


def test_band_is_min_to_max_with_few_months_and_the_middle_half_with_many():
    adds = [10, 20, 30, 40, 100]
    history = [month(0, 0, 0, 0, 0, a) for a in adds]
    three = project_month_end(so_far=[0, 0, 0, 0, 0], days_in_month=10, history=history[:3])
    assert (three.end.low, three.end.expected, three.end.high) == (10, 20, 30)
    five = project_month_end(so_far=[0, 0, 0, 0, 0], days_in_month=10, history=history)
    assert (five.end.low, five.end.expected, five.end.high) == (20, 30, 40)


def test_expected_path_never_goes_down_and_stays_inside_the_band():
    history = [month(100, 50, 0, 80, 0, 10, 0, 200, 0, 30), month(0, 0, 60, 0, 90, 0, 40, 0, 0, 10), month(300, 0, 0, 0, 0, 0, 0, 5, 5, 5)]
    p = project_month_end(so_far=cumulative([120, 0, 40, 0, 0]), days_in_month=10, history=history)
    values = [d.expected for d in p.days]
    assert values == sorted(values)
    assert all(d.low <= d.expected <= d.high for d in p.days)


def test_falls_back_to_a_plain_pace_line_with_thin_history():
    p = project_month_end(so_far=cumulative([100, 100, 100, 100, 100]), days_in_month=10, history=[month(50)])
    assert p.method == "pace" and p.basis_months == 0
    assert p.end.expected == 1000 and p.end.low == p.end.high == 1000


def test_no_projection_when_it_cannot_mean_anything():
    history = [month(100)] * 3
    assert project_month_end(so_far=[10, 10], days_in_month=10, history=history) is None            # barely started
    assert project_month_end(so_far=list(range(10)), days_in_month=10, history=history) is None      # month is over
    assert project_month_end(so_far=[0, 0, 0, 0], days_in_month=10, history=[]) is None              # nothing spent, nothing learned


def test_months_with_no_spending_are_ignored_as_history():
    history = [month(0), month(0), month(100, 0, 0, 0, 0, 50), month(100, 0, 0, 0, 0, 50)]
    p = project_month_end(so_far=cumulative([100, 0, 0, 0, 0]), days_in_month=10, history=history)
    assert p.method == "pace"        # only two usable months
