import pytest

from tests.support.sample_data import OPENING_BALANCE_POINTS as OPEN


def test_friend_pays_me_back(world):
    world.split()                                                # rahul owes 350
    s = world.settle(amount="100.00")
    assert s["entryType"] == "SETTLEMENT" and s["description"].startswith("Settlement from Rahul Sharma")
    assert "Group dinner (#" in s["description"]                  # FIFO coverage label
    assert world.friend_balance("rahul") == 25_000 and world.balance("bank") == OPEN - 50_000 + 10_000


def test_i_pay_friend_when_i_owe_them(world):
    world.fronted(amount="50.00")                                # I owe rahul 50
    s = world.settle(amount="20.00")
    assert s["description"].startswith("Payment to Rahul Sharma")
    assert world.friend_balance("rahul") == -3_000 and world.balance("bank") == OPEN - 2_000


def test_custom_description_wins_over_label(world):
    world.split()
    assert world.settle(amount="10.00", description="UPI transfer")["description"] == "Settlement from Rahul Sharma — UPI transfer"


def test_full_settlement_then_nothing_left_to_settle(world):
    world.split()
    world.settle(amount="350.00")
    assert world.friend_balance("rahul") == 0
    r = world.api.post("/settlements", json={"friend_id": world.friend["rahul"], "account_id": world.acct["bank"], "amount": "1"})
    assert r.status_code == 409 and "settled up" in r.json()["detail"]


@pytest.mark.parametrize("setup,amount", [("split", "350.01"), ("fronted", "50.01")])
def test_overpaying_is_409(world, setup, amount):
    getattr(world, setup)()
    r = world.api.post("/settlements", json={"friend_id": world.friend["rahul"], "account_id": world.acct["bank"], "amount": amount})
    assert r.status_code == 409 and world.friend_balance("rahul") != 0


def test_settlement_rejections(world):
    world.split()
    base = {"friend_id": world.friend["rahul"], "account_id": world.acct["bank"], "amount": "10"}
    for patch, code in (({"account_id": world.acct["usd"]}, 422), ({"friend_id": 99999}, 404),
                        ({"account_id": 99999}, 404), ({"amount": "0"}, 422), ({"amount": "x"}, 422)):
        assert world.api.post("/settlements", json={**base, **patch}).status_code == code, patch
    world.api.post(f"/accounts/{world.acct['wallet']}/deactivate")
    assert world.api.post("/settlements", json={**base, "account_id": world.acct["wallet"]}).status_code == 422


def test_settle_into_credit_card_reduces_debt(world):
    world.expense(account="card", amount="200.00")
    world.split(account="card", owner_share="0", shares=(("rahul", "100.00"),))
    world.settle(account="card", amount="100.00")
    assert world.balance("card") == 20_000


def test_edit_amount_excludes_own_prior_effect(world):
    world.split()
    s = world.settle(amount="350.00")                             # fully settled
    assert world.api.patch(f"/settlements/{s['id']}", json={"amount": "300.00"}).status_code == 200
    assert world.friend_balance("rahul") == 5_000
    assert world.api.patch(f"/settlements/{s['id']}", json={"amount": "350.01"}).status_code == 409


def test_edit_account_note_and_date(world):
    world.split()
    s = world.settle(amount="100.00")
    r = world.api.patch(f"/settlements/{s['id']}", json={"account_id": world.acct["wallet"], "note": "cash", "date": "2026-01-02"})
    assert r.status_code == 200 and world.balance("wallet") == 10_000
    assert world.entry(s["id"])["memo"] == "cash"


def test_edit_can_move_to_another_friend(world):
    world.split(shares=(("rahul", "350.00"), ("priya", "100.00")), owner_share="50.00")
    s = world.settle(friend="rahul", amount="50.00")
    assert world.api.patch(f"/settlements/{s['id']}", json={"friend_id": world.friend["priya"]}).status_code == 200
    assert (world.friend_balance("rahul"), world.friend_balance("priya")) == (35_000, 5_000)


def test_delete_settlement_restores_balance(world):
    world.split()
    s = world.settle(amount="100.00")
    assert world.api.delete(f"/settlements/{s['id']}").status_code == 200
    assert world.friend_balance("rahul") == 35_000 and world.balance("bank") == OPEN - 50_000
    assert world.api.delete(f"/settlements/{s['id']}").status_code == 404
    assert world.api.patch("/settlements/99999", json={"amount": "1"}).status_code == 404


def test_settlement_endpoints_reject_other_entry_types(world):
    e = world.expense()["id"]
    assert world.api.patch(f"/settlements/{e}", json={"amount": "1"}).status_code == 422
    assert world.api.delete(f"/settlements/{e}").status_code == 422


def test_list_settlements_and_friend_filter(world):
    world.split(shares=(("rahul", "100.00"), ("priya", "100.00")), owner_share="50.00")
    world.settle(friend="rahul", amount="10.00"); world.settle(friend="priya", amount="20.00")
    assert len(world.api.get("/settlements").json()) == 2
    only = world.api.get("/settlements", params={"friend_id": world.friend["priya"]}).json()
    assert len(only) == 1 and only[0]["amount"]["points"] == 2_000
    assert world.api.get("/settlements", params={"friend_id": 99999}).json() == []


def test_friend_statement_running_balance(world):
    world.split(); world.fronted(amount="50.00"); world.settle(amount="100.00")
    rows = world.api.get(f"/friends/{world.friend['rahul']}/statement").json()
    assert [(r["entryType"], r["delta"]["points"], r["runningBalance"]["points"]) for r in rows] == [
        ("SPLIT", 35_000, 35_000), ("FRONTED", -5_000, 30_000), ("SETTLEMENT", -10_000, 20_000)]
    assert world.friend_balance("rahul") == 20_000


def test_statement_rows_carry_the_owners_local_date(world):
    world.split(date="2026-03-05")
    world.settle(amount="100.00", date="2026-03-12")
    rows = world.api.get(f"/friends/{world.friend['rahul']}/statement").json()
    assert [r["date"] for r in rows] == ["2026-03-05", "2026-03-12"]


def test_statement_for_an_unknown_friend_is_404(world):
    assert world.api.get("/friends/99999/statement").status_code == 404


def test_a_settlement_without_a_description_is_titled_from_what_it_covers(world):
    d = world.api.post("/transactions", json={
        "type": "split", "description": "Goa hotel", "amount": "90.00", "date": "2026-03-10", "accountId": world.acct["bank"],
        "categoryId": world.cat["food"], "yourShare": "30.00",
        "splits": [{"friendId": world.friend["rahul"], "share": "60.00"}]}).json()
    r = world.api.post("/transactions", json={
        "type": "settlement", "amount": "20.00", "date": "2026-03-11", "friendId": world.friend["rahul"],
        "accountId": world.acct["bank"]})
    assert r.status_code == 201, r.text
    assert r.json()["description"] == f"Settlement from Rahul Sharma — Goa hotel (#{d['id']})"


def test_other_transactions_still_need_a_description(world):
    r = world.api.post("/transactions", json={"type": "expense", "amount": "5.00", "date": "2026-03-10",
                                              "accountId": world.acct["bank"], "categoryId": world.cat["food"]})
    assert r.status_code == 422 and "description" in r.json()["detail"]
