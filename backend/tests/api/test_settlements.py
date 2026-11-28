import pytest

from tests.support.sample_data import OPENING_BALANCE_POINTS as OPEN


def _bill(world, title, friend="rahul"):
    return next(b for b in world.bills(friend, open_only=False) if b["description"] == title)


def test_friend_pays_me_back_for_a_bill(world):
    world.split()                                                # rahul owes 350
    s = world.settle(amount="100.00")
    assert s["type"] == "settlement" and s["description"] == "Settlement from Rahul Sharma — Group dinner"
    assert s["settlesEntryId"] == _bill(world, "Group dinner")["entryId"]
    assert world.friend_balance("rahul") == 25_000 and world.balance("bank") == OPEN - 50_000 + 10_000
    b = _bill(world, "Group dinner")
    assert (b["paid"]["points"], b["remaining"]["points"], b["status"]) == (10_000, 25_000, "partial")


def test_i_pay_friend_for_what_i_owe_them(world):
    world.fronted(amount="50.00")                                # I owe rahul 50
    s = world.settle(amount="20.00")
    assert s["description"].startswith("Payment to Rahul Sharma — Tea")
    assert world.friend_balance("rahul") == -3_000 and world.balance("bank") == OPEN - 2_000


def test_one_payment_for_several_bills_makes_one_entry_per_bill_in_a_group(world):
    world.split(title="Dinner", owner_share="150.00", shares=(("rahul", "350.00"),))
    world.split(title="Movie", owner_share="100.00", shares=(("rahul", "200.00"),))
    r = world.pay([(_bill(world, "Dinner")["entryId"], "350.00"), (_bill(world, "Movie")["entryId"], "50.00")])
    assert r.status_code == 201, r.text
    body = r.json()
    assert len(body["transactions"]) == 2 and body["paymentGroup"]
    assert {t["paymentGroup"] for t in body["transactions"]} == {body["paymentGroup"]}
    assert world.friend_balance("rahul") == 15_000
    assert (_bill(world, "Dinner", )["status"], _bill(world, "Movie")["status"]) == ("paid", "partial")


def test_direction_comes_from_the_bill_not_the_balance(world):
    world.split(title="Dinner", owner_share="150.00", shares=(("rahul", "350.00"),))   # he owes 350
    world.fronted(amount="80.00", title="Taxi")                                         # I owe 80
    assert world.friend_balance("rahul") == 27_000
    taxi = _bill(world, "Taxi")
    r = world.pay([(taxi["entryId"], "80.00")])                  # pay the taxi in cash although net he owes me
    assert r.status_code == 201, r.text
    assert r.json()["transactions"][0]["description"].startswith("Payment to Rahul Sharma")
    assert world.friend_balance("rahul") == 35_000          # his 350 less nothing: the 80 I owed is now paid
    assert world.balance("bank") == OPEN - 50_000 - 8_000


def test_mixed_directions_in_one_payment_are_refused(world):
    world.split(title="Dinner"); world.fronted(amount="80.00", title="Taxi")
    r = world.pay([(_bill(world, "Dinner")["entryId"], "10.00"), (_bill(world, "Taxi")["entryId"], "10.00")])
    assert r.status_code == 422 and "one direction" in r.json()["detail"]


@pytest.mark.parametrize("setup,amount", [("split", "350.01"), ("fronted", "50.01")])
def test_paying_more_than_is_left_on_the_bill_is_409(world, setup, amount):
    getattr(world, setup)()
    bill = world.bills()[0]
    r = world.pay([(bill["entryId"], amount)])
    assert r.status_code == 409 and "is left on" in r.json()["detail"]
    assert world.friend_balance("rahul") != 0


def test_a_bill_that_is_paid_has_nothing_left_to_pay(world):
    world.split()
    bill = world.bills()[0]
    assert world.pay([(bill["entryId"], "350.00")]).status_code == 201
    assert world.friend_balance("rahul") == 0 and world.bills() == []
    assert world.pay([(bill["entryId"], "1.00")]).status_code == 409


def test_settlement_rejections(world):
    world.split()
    bid = world.bills()[0]["entryId"]
    base = {"friend_id": world.friend["rahul"], "account_id": world.acct["bank"],
            "allocations": [{"bill_id": bid, "amount": "10"}]}
    for patch, code in (({"account_id": world.acct["usd"]}, 422), ({"friend_id": 99999}, 404),
                        ({"account_id": 99999}, 404), ({"allocations": []}, 422),
                        ({"allocations": [{"bill_id": bid, "amount": "0"}]}, 422),
                        ({"allocations": [{"bill_id": bid, "amount": "x"}]}, 422),
                        ({"allocations": [{"bill_id": 99999, "amount": "5"}]}, 422),
                        ({"allocations": [{"bill_id": bid, "amount": "5"}, {"bill_id": bid, "amount": "5"}]}, 422)):
        assert world.api.post("/settlements", json={**base, **patch}).status_code == code, patch
    world.api.post(f"/accounts/{world.acct['wallet']}/deactivate")
    assert world.api.post("/settlements", json={**base, "account_id": world.acct["wallet"]}).status_code == 422


def test_a_payment_cannot_be_dated_before_its_bill(world):
    world.split(date="2026-03-10")
    bid = world.bills()[0]["entryId"]
    r = world.pay([(bid, "10.00")], date="2026-03-09")
    assert r.status_code == 422 and "before the bill" in r.json()["detail"]
    assert world.pay([(bid, "10.00")], date="2026-03-10").status_code == 201


def test_settle_into_credit_card_reduces_debt(world):
    world.expense(account="card", amount="200.00")
    world.split(account="card", owner_share="0", shares=(("rahul", "100.00"),))
    world.settle(account="card", amount="100.00")
    assert world.balance("card") == 20_000


def test_only_the_note_of_a_payment_can_be_edited(world):
    world.split()
    s = world.settle(amount="100.00")
    r = world.api.patch(f"/settlements/{s['id']}", json={"note": "cash"})
    assert r.status_code == 200 and r.json()["memo"] == "cash" and r.json()["settlesEntryId"] == s["settlesEntryId"]
    assert world.friend_balance("rahul") == 25_000
    for body in ({"amount": "5"}, {"accountId": world.acct["wallet"]}):
        assert world.api.patch(f"/transactions/{s['id']}", json=body).status_code == 422


def test_delete_settlement_restores_balance_and_the_bill(world):
    world.split()
    s = world.settle(amount="100.00")
    assert world.api.delete(f"/settlements/{s['id']}").status_code == 200
    assert world.friend_balance("rahul") == 35_000 and world.balance("bank") == OPEN - 50_000
    assert _bill(world, "Group dinner")["status"] == "unpaid"
    assert world.api.delete(f"/settlements/{s['id']}").status_code == 404
    assert world.api.patch("/settlements/99999", json={"note": "x"}).status_code == 404


def test_settlement_endpoints_reject_other_entry_types(world):
    e = world.expense()["id"]
    assert world.api.patch(f"/settlements/{e}", json={"note": "x"}).status_code == 422
    assert world.api.delete(f"/settlements/{e}").status_code == 422


def test_a_settlement_cannot_be_created_through_the_flat_endpoint(world):
    r = world.api.post("/transactions", json={"type": "settlement", "amount": "20.00",
                                              "friendId": world.friend["rahul"], "accountId": world.acct["bank"]})
    assert r.status_code == 422 and "POST /settlements" in r.json()["detail"]


def test_list_settlements_and_friend_filter(world):
    world.split(shares=(("rahul", "100.00"), ("priya", "100.00")), owner_share="50.00")
    world.settle(friend="rahul", amount="10.00"); world.settle(friend="priya", amount="20.00")
    assert len(world.api.get("/settlements").json()) == 2
    only = world.api.get("/settlements", params={"friend_id": world.friend["priya"]}).json()
    assert len(only) == 1 and only[0]["amount"]["points"] == 2_000
    assert world.api.get("/settlements", params={"friend_id": 99999}).json() == []


def test_friend_statement_running_balance_and_payment_links(world):
    world.split(); world.fronted(amount="50.00"); s = world.settle(amount="100.00")
    rows = world.api.get(f"/friends/{world.friend['rahul']}/statement").json()
    assert [(r["entryType"], r["delta"]["points"], r["runningBalance"]["points"]) for r in rows] == [
        ("SPLIT", 35_000, 35_000), ("FRONTED", -5_000, 30_000), ("SETTLEMENT", -10_000, 20_000)]
    assert rows[2]["settlesEntryId"] == s["settlesEntryId"] and rows[2]["paymentGroup"]
    assert world.friend_balance("rahul") == 20_000


def test_statement_rows_carry_the_owners_local_date(world):
    world.split(date="2026-03-05")
    world.settle(amount="100.00", date="2026-03-12")
    rows = world.api.get(f"/friends/{world.friend['rahul']}/statement").json()
    assert [r["date"] for r in rows] == ["2026-03-05", "2026-03-12"]


def test_statement_for_an_unknown_friend_is_404(world):
    assert world.api.get("/friends/99999/statement").status_code == 404


def test_other_transactions_still_need_a_description(world):
    r = world.api.post("/transactions", json={"type": "expense", "amount": "5.00", "date": "2026-03-10",
                                              "accountId": world.acct["bank"], "categoryId": world.cat["food"]})
    assert r.status_code == 422 and "description" in r.json()["detail"]
