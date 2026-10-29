"""Reports & Trends analysis endpoints: overview, categories, compare, budget history, outlook."""
import datetime as dt
from zoneinfo import ZoneInfo

from tests.support.sample_data import OPENING_BALANCE_POINTS as OPEN


def ym(back: int) -> tuple[int, int]:
    now = dt.datetime.now(ZoneInfo("Asia/Kolkata"))
    year, month0 = divmod(now.year * 12 + now.month - 1 - back, 12)
    return year, month0 + 1


def on(back: int, day: int = 3) -> str:
    """A date `back` months ago (day 1 for this month, so it is never in the future)."""
    year, month = ym(back)
    return f"{year}-{month:02d}-{1 if back == 0 else day:02d}"


def label(back: int) -> str:
    year, month = ym(back)
    return f"{year}-{month:02d}"


# The seeded world opens with OPEN of salary dated now, so this month's income always includes it.
def get(world, path, **params):
    r = world.api.get(f"/reports/{path}", params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- overview ---
def test_overview_compares_the_window_with_the_one_before(world):
    world.income(amount="2000.00", date=on(2))
    world.income(amount="2000.00", date=on(1))
    world.income(amount="1000.00", date=on(0))
    world.expense(amount="500.00", date=on(2))
    world.expense(amount="300.00", date=on(1))
    world.expense(amount="400.00", date=on(0))
    d = get(world, "overview", months=3)
    assert d["currency"] == "INR" and len(d["points"]) == 3 and len(d["previousPoints"]) == 3
    assert [(p["income"]["points"], p["expense"]["points"], p["savingsRate"]) for p in d["points"]] == [
        (200_000, 50_000, 75.0), (200_000, 30_000, 85.0), (100_000 + OPEN, 40_000, 99.2)]
    assert [p["isPartial"] for p in d["points"]] == [False, False, True]
    assert (d["points"][2]["year"], d["points"][2]["month"]) == ym(0)
    assert d["current"]["income"]["points"] == 500_000 + OPEN and d["current"]["net"]["points"] == 380_000 + OPEN
    assert d["current"]["savingsRate"] == 97.8 and d["current"]["averageExpense"]["points"] == 40_000
    assert d["previous"]["income"]["points"] == 0 and d["previous"]["savingsRate"] is None
    assert all(p["income"]["points"] == 0 for p in d["previousPoints"])


def test_overview_net_worth_owed_and_income_sources(world):
    world.income(amount="2000.00", date=on(0))
    world.expense(account="card", amount="500.00", date=on(0))
    d = get(world, "overview", months=3)
    last = d["netWorth"][-1]
    assert last["assets"]["points"] == OPEN + 200_000 and last["liabilities"]["points"] == 50_000
    assert last["netWorth"]["points"] == OPEN + 200_000 - 50_000
    assert [(s["name"], s["points"][-1]["points"]) for s in d["incomeSources"]] == [("Salary", 200_000 + OPEN)]


def test_overview_flags_an_unusual_month_and_words_the_findings_as_codes(world):
    for back in (6, 5, 4, 3, 2, 1):
        world.income(amount="3000.00", date=on(back))
        world.expense(amount="1000.00", date=on(back))
    world.expense(amount="9000.00", date=on(7))                      # outside a 7-month window
    world.expense(amount="6000.00", date=on(3, 20))                  # one big month inside it
    d = get(world, "overview", months=7)
    flagged = [p for p in d["points"] if p["unusual"]]
    assert len(flagged) == 1 and (flagged[0]["year"], flagged[0]["month"]) == ym(3)
    assert flagged[0]["versusUsualPct"] > 100
    assert d["points"][-1]["unusual"] is False                       # the partial month is never judged
    codes = {f["code"]: f for f in d["findings"]}
    assert set(codes) >= {"savings_rate", "unusual_months", "main_income_cover"}
    assert codes["unusual_months"]["flagged"][0]["month"] == ym(3)[1]
    assert codes["main_income_cover"]["name"] == "Salary" and codes["main_income_cover"]["coverPct"] > 0
    assert d["points"][3]["rollingExpense"]["points"] > 0


def test_overview_rejects_a_bad_window(world):
    for bad in (0, 37):
        assert world.api.get("/reports/overview", params={"months": bad}).status_code == 422


# -------------------------------------------------------------- categories ---
def test_categories_judge_each_against_its_own_normal(world):
    for back in (5, 4, 3, 2, 1):
        world.expense(amount="1000.00", date=on(back))
    world.expense(amount="5000.00", date=on(0))
    world.expense(account="usd", category="travel_usd", amount="10.00", date=on(0))     # other currency: left out
    d = get(world, "categories", months=3)
    assert d["kind"] == "spending" and len(d["seriesMonths"]) == 6                    # a 3-month window still shows 6
    assert [c["name"] for c in d["categories"]] == ["Food"]
    food = d["categories"][0]
    assert food["current"]["points"] == 500_000 and food["state"] == "above" and food["versusUsualPct"] == 400.0
    assert food["usual"]["median"]["points"] == 100_000 and food["slope"]["points"] > 0
    assert food["average"]["points"] == 233_333 and food["previousAverage"]["points"] == 100_000
    assert food["changePct"] == 133.3 and food["sharePct"] == 100.0
    assert d["total"]["average"]["points"] == 233_333


def test_categories_income_kind_reports_income_categories(world):
    for back in (5, 4, 3, 2, 1):
        world.income(amount="2000.00", date=on(back))
    d = get(world, "categories", months=6, kind="income")
    assert d["kind"] == "income" and [c["name"] for c in d["categories"]] == ["Salary"]
    salary = d["categories"][0]
    assert salary["usual"]["median"]["points"] == 200_000 and salary["state"] == "above"   # this month holds the opening balance
    assert world.api.get("/reports/categories", params={"kind": "other"}).status_code == 422


def test_categories_with_too_little_history_have_no_usual_range(world):
    world.expense(amount="100.00", date=on(0))
    food = get(world, "categories", months=6)["categories"][0]
    assert food["usual"] is None and food["state"] is None and food["versusUsualPct"] is None


# ----------------------------------------------------------------- compare ---
def test_compare_splits_a_change_into_how_often_and_how_much(world):
    world.expense(amount="100.00", date=on(1))
    world.expense(amount="200.00", date=on(1))
    world.expense(amount="600.00", date=on(0))
    world.income(amount="1000.00", date=on(0))
    d = get(world, "compare", aFrom=label(0), aTo=label(0), bFrom=label(1), bTo=label(1))
    assert d["a"] == {"income": d["a"]["income"], "expense": d["a"]["expense"], "kept": d["a"]["kept"]}
    assert (d["a"]["expense"]["points"], d["b"]["expense"]["points"], d["a"]["kept"]["points"]) == (60_000, 30_000, OPEN + 40_000)
    food = d["categories"][0]
    assert food["name"] == "Food" and food["change"]["points"] == 30_000 and food["changePct"] == 100.0
    assert (food["purchasesA"], food["purchasesB"]) == (1, 2)
    assert (food["averagePurchaseA"]["points"], food["averagePurchaseB"]["points"]) == (60_000, 15_000)
    assert food["volumeEffect"]["points"] == -15_000 and food["ticketEffect"]["points"] == 45_000
    assert food["volumeEffect"]["points"] + food["ticketEffect"]["points"] == food["change"]["points"]
    assert d["volumeEffect"]["points"] == -15_000 and d["ticketEffect"]["points"] == 45_000
    assert food["shareOfChangePct"] == 100


def test_compare_counts_a_refund_in_the_total_but_not_as_a_purchase(world):
    e = world.expense(amount="100.00", date=on(1))
    world.expense(amount="50.00", date=on(1))
    r = world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "40.00", "account_id": world.acct["bank"], "date": on(1)})
    assert r.status_code == 201, r.text
    d = get(world, "compare", aFrom=label(1), aTo=label(1), bFrom=label(2), bTo=label(2))
    food = d["categories"][0]
    assert food["a"]["points"] == 11_000 and food["purchasesA"] == 2 and food["b"]["points"] == 0
    assert food["changePct"] is None and food["ticketEffect"]["points"] == 0 and food["volumeEffect"]["points"] == 11_000


def test_compare_validates_the_periods(world):
    base = {"aFrom": label(1), "aTo": label(0), "bFrom": label(3), "bTo": label(2)}
    assert world.api.get("/reports/compare", params=base).status_code == 200
    assert world.api.get("/reports/compare", params={**base, "aFrom": label(0), "aTo": label(1)}).status_code == 422
    assert world.api.get("/reports/compare", params={**base, "bFrom": label(40), "bTo": label(0)}).status_code == 422
    assert world.api.get("/reports/compare", params={**base, "aFrom": "2026-13"}).status_code == 422
    assert world.api.get("/reports/compare", params={"aFrom": label(1)}).status_code == 422


# ------------------------------------------------------------------ budgets ---
def test_budget_history_counts_months_held_and_finds_unbudgeted_spending(world):
    for back, amount in ((3, "6000.00"), (2, "7000.00"), (1, "4000.00")):
        world.expense(amount=amount, date=on(back))
    world.expense(amount="1000.00", date=on(0))
    world.expense(category="transport", amount="3000.00", date=on(1))
    d = get(world, "budget-history", months=4)
    food = d["budgets"][0]
    assert food["name"] == "Food" and food["limit"]["points"] == 500_000
    assert (food["held"], food["monthsOver"], food["completeMonths"]) == (1, 2, 3) and food["typicalPct"] == 120.0
    assert [p["points"] for p in food["points"]] == [600_000, 700_000, 400_000, 100_000]
    assert food["suggestion"]["action"] == "keep" and food["suggestion"]["limit"]["points"] == 500_000
    assert d["limitTotal"]["points"] == 500_000 and (d["held"], d["budgetMonths"]) == (1, 3)
    assert d["monthTotals"][-1]["isPartial"] is True and d["monthTotals"][-1]["spent"]["points"] == 100_000
    assert [u["name"] for u in d["unbudgeted"]] == ["Transport"]
    assert d["unbudgeted"][0]["peak"]["points"] == 300_000 and (
        d["unbudgeted"][0]["suggestion"]["period"], d["unbudgeted"][0]["suggestion"]["limit"]["points"]) == ("month", 200_000)
    assert d["coveragePct"] == 85


def test_budget_history_suggests_a_higher_limit_for_a_budget_that_keeps_breaking(world):
    for back in (6, 5, 4, 3, 2, 1):
        world.expense(amount="8000.00", date=on(back))
    food = get(world, "budget-history", months=7)["budgets"][0]
    assert food["suggestion"]["action"] == "raise" and food["suggestion"]["limit"]["points"] > 500_000
    assert food["suggestion"]["recentOvershoot"]["points"] == 300_000 and food["held"] == 0


def test_budget_history_with_nothing_spent(world):
    d = get(world, "budget-history", months=6)
    assert d["unbudgeted"] == [] and d["coveragePct"] is None
    food = d["budgets"][0]
    assert (food["held"], food["completeMonths"], food["suggestion"]["action"]) == (0, 0, "keep")   # no history yet, so no verdict


# ------------------------------------------------------------------ outlook ---
def test_outlook_without_history_says_so(world):
    d = get(world, "outlook", months=12)
    assert d["method"] == "none" and d["forecast"] == [] and d["yearEnd"] is None
    assert len(d["history"]) == 12 and d["netWorthNow"]["points"] == OPEN


def test_outlook_averages_a_short_history_and_widens_with_time(world):
    for back in (3, 2, 1):
        world.income(amount="2000.00", date=on(back))
        world.expense(amount="1000.00", date=on(back))
    d = get(world, "outlook", months=3)
    now = OPEN + 3 * 100_000
    assert d["method"] == "average" and d["learnedFrom"] == 3 and d["netWorthNow"]["points"] == now
    assert len(d["forecast"]) == 12 and (d["forecast"][0]["year"], d["forecast"][0]["month"]) == ym(0)
    # the rest of this month: the opening salary already beat the 2000 expected, and 1000 is still to go out
    assert d["forecast"][0]["expected"]["points"] == now - 100_000
    assert d["forecast"][11]["expected"]["points"] == now - 100_000 + 11 * 100_000
    assert d["typicalMonthlyKept"]["points"] == 100_000
    ye = d["yearEnd"]
    assert ye["netWorth"]["month"] == 12 and ye["kept"]["points"] == ye["income"]["points"] - ye["expense"]["points"]
    assert ye["savingsRate"] is not None and len(d["history"]) == 12


def test_outlook_band_grows_when_months_vary(world):
    for back, amount in ((3, "500.00"), (2, "1500.00"), (1, "1000.00")):
        world.income(amount="2000.00", date=on(back))
        world.expense(amount=amount, date=on(back))
    f = get(world, "outlook", months=3)["forecast"]
    widths = [p["high"]["points"] - p["low"]["points"] for p in f]
    assert widths[0] > 0 and widths == sorted(widths) and widths[11] > widths[0]


def test_outlook_a_year_of_history_repeats_the_same_month(world):
    for back in range(12, 0, -1):
        world.income(amount="2000.00", date=on(back, 4))
        world.expense(amount="1000.00" if back != 11 else "1900.00", date=on(back, 4))
    d = get(world, "outlook", months=12)
    assert d["method"] == "seasonal" and d["learnedFrom"] == 12
    # the expensive month a year ago comes round again 11 months from this one
    steps = [d["forecast"][i]["expected"]["points"] - d["forecast"][i - 1]["expected"]["points"] for i in range(1, 12)]
    assert min(steps) == 10_000 and steps.count(100_000) == 10


def test_outlook_levers_are_budgets_that_keep_running_over(world):
    for back in (3, 2, 1):
        world.expense(amount="6000.00", date=on(back))
    levers = get(world, "outlook", months=3)["levers"]
    assert [(lv["name"], lv["limit"]["points"], lv["typical"]["points"], lv["monthlySaving"]["points"]) for lv in levers] == [
        ("Food", 500_000, 600_000, 100_000)]
