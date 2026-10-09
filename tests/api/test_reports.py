import pytest

from tests.sample_data import OPENING_BALANCE_POINTS as OPEN


def inr(rows, key="currency"):
    return next(r for r in rows if r[key] == "INR")


def test_balance_report(world):
    rows = {r["name"]: r["balance"]["points"] for r in world.api.get("/reports/balance").json()}
    assert rows == {"Bank": OPEN, "Wallet": 0, "Credit Card": 0, "USD Account": 0}
    world.api.post(f"/accounts/{world.acct['wallet']}/deactivate")
    assert "Wallet" not in {r["name"] for r in world.api.get("/reports/balance").json()}
    assert "Wallet" in {r["name"] for r in world.api.get("/reports/balance", params={"includeInactive": True}).json()}


def test_net_worth_is_assets_minus_liabilities_per_currency(world):
    world.expense(account="card", amount="500.00")
    nw = inr(world.api.get("/reports/net-worth").json())
    assert (nw["assets"]["points"], nw["liabilities"]["points"], nw["netWorth"]["points"]) == (OPEN, 50_000, OPEN - 50_000)
    assert inr(world.api.get("/reports/net-worth").json() , "currency")["currency"] == "INR"
    assert {r["currency"] for r in world.api.get("/reports/net-worth").json()} == {"INR", "USD"}


def test_budget_math_and_over_budget_flag(world):
    world.expense(amount="6000.00")
    b = next(x for x in world.api.get("/reports/budget").json() if x["categoryId"] == world.cat["food"])
    assert b["budget"]["points"] == 500_000 and b["spent"]["points"] == 600_000
    assert b["remaining"]["points"] == -100_000 and b["percentageUsed"] == pytest.approx(120.0) and b["overBudget"] is True


def test_budget_under_limit_and_only_budgeted_categories_listed(world):
    world.expense(amount="1250.00")
    rows = world.api.get("/reports/budget").json()
    assert [r["categoryName"] for r in rows] == ["Food"]
    assert rows[0]["percentageUsed"] == pytest.approx(25.0) and rows[0]["overBudget"] is False


def test_budget_counts_only_owner_share_of_splits(world):
    world.split(owner_share="150.00", shares=(("rahul", "350.00"),))
    b = world.api.get("/reports/budget").json()[0]
    assert b["spent"]["points"] == 15_000


def test_spending_report_sorted_and_rolls_children_into_parent(world):
    world.expense(category="food", amount="100.00")
    world.expense(category="fuel", amount="300.00")
    world.expense(category="transport", amount="50.00")
    rows = world.api.get("/reports/spending").json()
    assert [(r["categoryName"], r["total"]["points"]) for r in rows][:2] == [("Transport", 35_000), ("Food", 10_000)]
    assert "Fuel" not in [r["categoryName"] for r in rows]             # only root categories


def test_income_report(world):
    world.income(amount="250.00", category="freelance")
    rows = {r["categoryName"]: r["total"]["points"] for r in world.api.get("/reports/income").json()}
    assert rows == {"Salary": OPEN, "Freelance": 25_000}


def test_month_parameter_selects_period(world):
    world.expense(amount="10.00", date="2026-01-10")
    jan = next(r for r in world.api.get("/reports/spending", params={"month": "2026-01"}).json() if r["categoryName"] == "Food")
    assert jan["total"]["points"] == 1_000 and (jan["year"], jan["month"]) == (2026, 1)
    feb = next(r for r in world.api.get("/reports/spending", params={"month": "2026-02"}).json() if r["categoryName"] == "Food")
    assert feb["total"]["points"] == 0


def test_month_boundaries_follow_owner_timezone(world):
    world.expense(amount="10.00", date="2026-01-31 23:59")      # still January in Asia/Kolkata (= 18:29 UTC)
    world.expense(amount="20.00", date="2026-02-01 00:00")
    food = lambda m: next(r for r in world.api.get("/reports/spending", params={"month": m}).json() if r["categoryName"] == "Food")["total"]["points"]
    assert (food("2026-01"), food("2026-02")) == (1_000, 2_000)


@pytest.mark.parametrize("month", ["2026-13", "2026-00", "abc", "2026-1", "26-01", "0000-01", "9999-12", "1899-12"])
def test_invalid_months_are_422(world, month):
    for ep in ("spending", "income", "budget", "dashboard"):
        assert world.api.get(f"/reports/{ep}", params={"month": month}).status_code == 422, (ep, month)


def test_dashboard_combines_everything(world):
    world.split(); world.expense(account="card", amount="200.00", category="transport")
    d = world.api.get("/reports/dashboard").json()
    assert set(d) == {"year", "month", "netWorth", "summary", "accountBalances", "budgetStatus", "topSpending", "incomeSummary",
                    "friendBalances", "friendTotals"}
    assert len(d["accountBalances"]) == 4 and d["friendBalances"][0]["balance"]["points"] == 35_000
    assert d["topSpending"][0]["categoryName"] == "Transport" and len(d["topSpending"]) <= 5


def test_reference_data_lists_active_items_only(world):
    world.api.post(f"/accounts/{world.acct['wallet']}/deactivate")
    ref = world.api.get("/reports/reference-data").json()
    assert {a["name"] for a in ref["accounts"]} == {"Bank", "Credit Card", "USD Account"}
    assert len(ref["categories"]) == 6 and {f["name"] for f in ref["friends"]} == {"Rahul Sharma", "Priya Nair"}


def test_cashflow_trend(world):
    world.expense(amount="100.00"); world.income(amount="40.00", category="freelance")
    pts = world.api.get("/reports/trends/cashflow", params={"months": 3}).json()["points"]
    assert len(pts) == 3
    last = pts[-1]
    assert (last["income"]["points"], last["expense"]["points"], last["net"]["points"]) == (OPEN + 4_000, 10_000, OPEN + 4_000 - 10_000)
    assert pts[0]["income"]["points"] == 0


def test_net_worth_trend_last_point_matches_current(world):
    world.expense(account="card", amount="100.00")
    series = world.api.get("/reports/trends/net-worth", params={"months": 12}).json()
    s = inr(series, "currency")
    assert len(s["points"]) == 12 and s["points"][-1]["value"]["points"] == OPEN - 10_000
    assert s["points"][0]["value"]["points"] == 0                       # nothing existed a year ago


def test_category_spending_trend(world):
    world.expense(amount="70.00")
    t = world.api.get("/reports/trends/spending", params={"category_id": world.cat["food"], "months": 2}).json()
    assert t["label"] == "Food" and len(t["points"]) == 2 and t["points"][-1]["value"]["points"] == 7_000


def test_trend_parameter_validation(world):
    assert world.api.get("/reports/trends/spending", params={"category_id": 99999}).status_code == 404
    assert world.api.get("/reports/trends/spending", params={"category_id": world.acct["bank"]}).status_code == 404
    assert world.api.get("/reports/trends/spending").status_code == 422
    for m in (0, 61, "x"):
        assert world.api.get("/reports/trends/cashflow", params={"months": m}).status_code == 422


def test_friend_balances_sign_convention(world):
    world.split(); world.fronted(friend="priya", amount="80.00")
    assert (world.friend_balance("rahul"), world.friend_balance("priya")) == (35_000, -8_000)


def test_dashboard_summary_and_friend_totals_are_computed_server_side(world):
    world.split()                                                        # you paid 500; Rahul owes 350
    world.fronted(friend="priya", amount="80.00")                        # you owe Priya 80
    world.income(amount="1000.00", category="freelance")
    d = world.api.get("/reports/dashboard").json()
    inr = next(x for x in d["summary"] if x["currency"] == "INR")
    # spend = your 150 share + Priya-fronted 80 (counted in full); income = opening salary + freelance
    assert inr["expense"]["points"] == 15_000 + 8_000
    assert inr["income"]["points"] == 5_000_000 + 100_000
    assert inr["savings"]["points"] == inr["income"]["points"] - inr["expense"]["points"]
    totals = next(x for x in d["friendTotals"] if x["currency"] == "INR")
    assert totals["owedToYou"]["points"] == 35_000 and totals["youOwe"]["points"] == 8_000
    assert {b["friendName"] for b in d["friendBalances"]} == {"Rahul Sharma", "Priya Nair"}


def test_spending_includes_per_subcategory_breakdown(world):
    world.expense(category="fuel", amount="40.00")
    world.expense(category="transport", amount="10.00")
    rows = world.api.get("/reports/spending").json()
    transport = next(r for r in rows if r["categoryName"] == "Transport")
    assert transport["total"]["points"] == 5_000                         # parent + child rolled up
    assert [(c["categoryName"], c["total"]["points"]) for c in transport["children"]] == [("Fuel", 4_000)]
    assert next(r for r in rows if r["categoryName"] == "Food")["children"] == []


def test_balance_report_and_reference_data_are_typed_and_camel_cased(world):
    bal = world.api.get("/reports/balance").json()
    assert {"accountId", "name", "accountType", "isActive", "balance"} <= set(bal[0])
    ref = world.api.get("/reports/reference-data").json()
    fuel = next(c for c in ref["categories"] if c["name"] == "Fuel")
    assert fuel["parentId"] == world.cat["transport"] and "currencyCode" in fuel
    assert {"id", "name", "email"} == set(ref["friends"][0])
