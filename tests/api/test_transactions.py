import pytest

from tests.sample_data import DINNER, DINNER_POINTS, OPENING_BALANCE_POINTS


def test_expense_reduces_asset_and_posts_two_balanced_legs(world):
    e = world.expense(amount=DINNER, title="Dinner")
    assert e["entryType"] == "NORMAL" and e["amount"]["major"] == "INR 500.00"
    assert world.balance("bank") == OPENING_BALANCE_POINTS - DINNER_POINTS
    detail = world.entry(e["id"])
    legs = {(p["accountName"], p["side"], p["amount"]["points"]) for p in detail["postings"]}
    assert legs == {("Bank", "CREDIT", DINNER_POINTS), ("Food", "DEBIT", DINNER_POINTS)}


def test_expense_on_credit_card_increases_amount_owed(world):
    world.expense(account="card", amount=DINNER)
    assert world.balance("card") == DINNER_POINTS


def test_income_increases_asset(world):
    world.income(amount="250.50", category="freelance")
    assert world.balance("bank") == OPENING_BALANCE_POINTS + 25_050


def test_income_into_liability_is_rejected(world):
    r = world.api.post("/transactions/income", json={"account_id": world.acct["card"],
                                                     "category_id": world.cat["salary"], "amount": "10", "title": "x"})
    assert r.status_code == 422


@pytest.mark.parametrize("kw,why", [
    ({"category": "salary"}, "income category used for an expense"),
    ({"category": "travel_usd"}, "currency mismatch account/category"),
    ({"account": "usd"}, "currency mismatch category/account"),
])
def test_expense_rejections(world, kw, why):
    assert world.api.post("/transactions/expense", json=world.expense_payload(**kw)).status_code == 422, why


@pytest.mark.parametrize("amount", ["0", "0.00", "-5", "1.234", "abc", "", "1e3", "²", "9" * 40])
def test_invalid_amounts_are_422(world, amount):
    assert world.api.post("/transactions/expense", json=world.expense_payload(amount=amount)).status_code == 422


@pytest.mark.parametrize("payload", [{}, {"title": ""}, {"title": "x" * 501}, {"note": "n" * 2001}, {"account_id": "abc"}])
def test_expense_schema_validation(world, payload):
    body = {**world.expense_payload(), **payload}
    if payload == {}:
        body = {}
    assert world.api.post("/transactions/expense", json=body).status_code == 422


def test_unknown_account_or_category_404(world):
    assert world.api.post("/transactions/expense", json={**world.expense_payload(), "account_id": 99999}).status_code == 404
    assert world.api.post("/transactions/expense", json={**world.expense_payload(), "category_id": 99999}).status_code == 404


def test_explicit_date_is_interpreted_in_owner_timezone(world):
    e = world.expense(date="2026-01-15")
    assert e["entryDate"] == "2026-01-14T18:30:00+00:00"
    assert world.api.post("/transactions/expense", json=world.expense_payload(date="15/01/2026")).status_code == 422


# ------------------------------------------------------------------ refunds ---
def test_partial_refunds_until_exhausted(world):
    e = world.expense(amount="500.00")
    for amount, code in (("200.00", 201), ("300.00", 201), ("0.01", 409)):
        r = world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": amount})
        assert r.status_code == code, r.text
    assert world.balance("bank") == OPENING_BALANCE_POINTS      # fully refunded


def test_refund_over_remainder_is_409_and_states_remainder(world):
    e = world.expense(amount="500.00")
    world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "400.00"})
    r = world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "150.00"})
    assert r.status_code == 409 and "100.00" in r.json()["detail"]


def test_refund_to_credit_card_reduces_what_is_owed(world):
    e = world.expense(account="card", amount="500.00")
    world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "120.00"})
    assert world.balance("card") == 38_000


def test_refund_can_land_in_a_different_account(world):
    e = world.expense(amount="500.00")
    world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "100.00", "account_id": world.acct["wallet"]})
    assert world.balance("wallet") == 10_000


def test_refund_reduces_budget_spend(world):
    e = world.expense(amount="500.00")
    world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "200.00"})
    food = next(b for b in world.api.get("/reports/budget").json() if b["categoryId"] == world.cat["food"])
    assert food["spent"]["points"] == 30_000


def test_refund_rejections(world):
    sp = world.split()["entry"]["id"]
    assert world.api.post("/transactions/refund", json={"for_entry_id": sp, "amount": "1"}).status_code == 422
    assert world.api.post("/transactions/refund", json={"for_entry_id": 99999, "amount": "1"}).status_code == 404
    e = world.expense()
    assert world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "abc"}).status_code == 422


def test_cannot_delete_an_expense_that_has_refunds(world):
    e = world.expense(amount="500.00")
    world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "100.00"})
    r = world.api.delete(f"/transactions/{e['id']}")
    assert r.status_code == 409 and "refund" in r.json()["detail"]
    assert world.api.get(f"/transactions/{e['id']}").status_code == 200


def test_cannot_lower_an_expense_below_its_refunded_amount(world):
    e = world.expense(amount="500.00")
    world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "300.00"})
    assert world.api.patch(f"/transactions/{e['id']}", json={"amount": "200.00"}).status_code == 409
    assert world.api.patch(f"/transactions/{e['id']}", json={"amount": "300.00"}).status_code == 200


def test_deleting_the_refund_first_then_the_expense_works(world):
    e = world.expense(amount="500.00")
    rf = world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "100.00"}).json()
    assert world.api.delete(f"/transactions/{rf['id']}").status_code == 200
    assert world.api.delete(f"/transactions/{e['id']}").status_code == 200
    assert world.balance("bank") == OPENING_BALANCE_POINTS


def test_edit_refund_respects_original_amount(world):
    e = world.expense(amount="500.00")
    rf = world.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "100.00"}).json()
    assert world.api.patch(f"/transactions/{rf['id']}", json={"amount": "500.00"}).status_code == 200
    assert world.api.patch(f"/transactions/{rf['id']}", json={"amount": "500.01"}).status_code == 409


# -------------------------------------------------------------- adjustments ---
@pytest.mark.parametrize("side,delta", [("DEBIT", 1000), ("CREDIT", -1000)])
def test_adjustment_moves_real_account_and_uses_equity(world, side, delta):
    r = world.api.post("/transactions/adjustment", json={"account_id": world.acct["bank"], "amount": "10.00",
                                                         "side": side, "title": "Correction"})
    assert r.status_code == 201 and r.json()["entryType"] == "ADJUSTMENT"
    assert world.balance("bank") == OPENING_BALANCE_POINTS + delta
    assert "Adjustments" in {p["accountName"] for p in world.entry(r.json()["id"])["postings"]}


def test_adjustment_side_validation(world):
    r = world.api.post("/transactions/adjustment", json={"account_id": world.acct["bank"], "amount": "1", "side": "SIDEWAYS", "title": "x"})
    assert r.status_code == 422


def test_adjustment_edit_keeps_side(world):
    a = world.api.post("/transactions/adjustment", json={"account_id": world.acct["bank"], "amount": "10.00", "side": "CREDIT", "title": "c"}).json()
    assert world.api.patch(f"/transactions/{a['id']}", json={"amount": "25.00"}).status_code == 200
    assert world.balance("bank") == OPENING_BALANCE_POINTS - 2500


# ------------------------------------------------------------ edit / delete ---
def test_direct_edit_amount_account_category_and_text(world):
    e = world.expense(amount="100.00", title="Lunch")
    r = world.api.patch(f"/transactions/{e['id']}", json={"amount": "150.00", "title": "Big lunch", "note": "with team",
                                                          "category_id": world.cat["transport"], "account_id": world.acct["wallet"]})
    assert r.status_code == 200 and r.json()["id"] == e["id"]
    d = world.entry(e["id"])
    assert (d["description"], d["memo"], d["categoryId"]) == ("Big lunch", "with team", world.cat["transport"])
    assert (world.balance("bank"), world.balance("wallet")) == (OPENING_BALANCE_POINTS, -15_000)


def test_edit_validates_like_create(world):
    e = world.expense()
    for body in ({"amount": "0"}, {"category_id": world.cat["salary"]}, {"account_id": world.acct["usd"]}, {"date": "junk"}):
        assert world.api.patch(f"/transactions/{e['id']}", json=body).status_code == 422, body
    assert world.api.patch("/transactions/99999", json={"amount": "1"}).status_code == 404


def test_edit_income_entry(world):
    i = world.income(amount="100.00", category="freelance")
    assert world.api.patch(f"/transactions/{i['id']}", json={"amount": "300.00"}).status_code == 200
    assert world.balance("bank") == OPENING_BALANCE_POINTS + 30_000


def test_direct_delete_removes_entry_and_restores_balance(world):
    e = world.expense()
    assert world.api.delete(f"/transactions/{e['id']}").status_code == 200
    assert world.balance("bank") == OPENING_BALANCE_POINTS
    assert world.api.get(f"/transactions/{e['id']}").status_code == 404
    assert world.api.delete(f"/transactions/{e['id']}").status_code == 404


# ------------------------------------------------------------------ listing ---
def test_list_pagination_envelope_and_order(world):
    ids = [world.expense(title=f"E{i}", date=f"2026-02-0{i}")["id"] for i in range(1, 6)]
    page = world.api.get("/transactions", params={"limit": 2, "offset": 1, "categoryId": world.cat["food"]}).json()
    assert set(page) == {"items", "total", "limit", "offset"} and page["total"] == 5
    assert [i["id"] for i in page["items"]] == [ids[3], ids[2]]        # newest first


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 501}, {"offset": -1}, {"accountId": "x"}, {"dateFrom": "junk"}])
def test_list_parameter_validation(world, params):
    assert world.api.get("/transactions", params=params).status_code == 422


def test_list_filters(world):
    world.expense(title="Coffee beans", amount="10.00", account="bank", date="2026-01-10")
    world.expense(title="Bus ticket", amount="20.00", account="wallet", category="transport", date="2026-02-10", note="airport 50%")
    q = lambda **p: {i["description"] for i in world.api.get("/transactions", params=p).json()["items"]}
    assert q(accountId=world.acct["wallet"]) == {"Bus ticket"}
    assert q(categoryId=world.cat["transport"]) == {"Bus ticket"}
    assert q(search="coffee") == {"Coffee beans"} and q(search="airport") == {"Bus ticket"}
    assert q(dateFrom="2026-02-01", categoryId=world.cat["transport"]) == {"Bus ticket"}
    assert q(dateTo="2026-02-01", search="e") >= {"Coffee beans"} and "Bus ticket" not in q(dateTo="2026-02-01")
    assert q(search="zzz") == set()


def test_get_transaction_detail_404(world):
    assert world.api.get("/transactions/99999").status_code == 404
