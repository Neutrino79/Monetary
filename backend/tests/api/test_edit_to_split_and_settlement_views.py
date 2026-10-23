"""Editing a plain expense into a split (and back), and settlements showing up on the Income/Expense lists
(filtered by which way the money moved) with the delete-only settlement action."""
from __future__ import annotations

import pytest


def patch(world, entry_id, **body):
    return world.api.patch(f"/transactions/{entry_id}", json=body)


def make(world, type_, **kw):
    r = world.api.post("/transactions", json={"type": type_, "description": "Test", "amount": "100.00",
                                              "date": "2026-03-10", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def expense(world, amount="100.00"):
    return make(world, "expense", amount=amount, accountId=world.acct["bank"], categoryId=world.cat["food"])


def income(world, amount="100.00"):
    return make(world, "income", amount=amount, accountId=world.acct["bank"], categoryId=world.cat["salary"])


def split(world, total="500.00", yours="150.00", rahul="350.00"):
    return make(world, "split", amount=total, accountId=world.acct["bank"], categoryId=world.cat["food"],
                yourShare=yours, splits=shares(world, ("rahul", rahul)))


def fronted(world, friend="rahul", amount="50.00"):
    return make(world, "fronted", amount=amount, categoryId=world.cat["food"], friendId=world.friend[friend])


def settle(world, friend="rahul", amount="100.00"):
    return make(world, "settlement", amount=amount, friendId=world.friend[friend], accountId=world.acct["bank"])


def shares(world, *pairs):
    return [{"friendId": world.friend[name], "share": share} for name, share in pairs]


# ------------------------------------------------------------- expense -> split ---
@pytest.mark.parametrize("mode", ["DIRECT", "STRICT"])
def test_an_expense_can_be_edited_into_a_split(world, mode):
    world.set_mode(mode)
    e = expense(world, amount="100.00")
    bank_before = world.balance("bank")
    r = patch(world, e["id"], yourShare="40.00", splits=shares(world, ("rahul", "60.00")))
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["type"] == "split" and s["amount"]["points"] == 10_000 and s["yourShare"]["points"] == 4_000
    assert [(x["friendId"], x["share"]["points"]) for x in s["splits"]] == [(world.friend["rahul"], 6_000)]
    assert world.balance("bank") == bank_before             # you still paid the whole bill from the same account
    assert world.friend_balance("rahul") == 6_000
    got = world.api.get(f"/transactions/{s['id']}").json()
    assert got["type"] == "split"


def test_the_bill_can_change_while_splitting(world):
    e = expense(world, amount="100.00")
    r = patch(world, e["id"], amount="200.00", yourShare="50.00", splits=shares(world, ("rahul", "150.00")))
    assert r.status_code == 200, r.text
    assert r.json()["amount"]["points"] == 20_000 and world.friend_balance("rahul") == 15_000


def test_splitting_checks_the_shares_add_up(world):
    e = expense(world, amount="100.00")
    r = patch(world, e["id"], yourShare="40.00", splits=shares(world, ("rahul", "50.00")))
    assert r.status_code == 422 and "add up" in r.json()["detail"]
    assert world.friend_balance("rahul") == 0
    assert world.api.get(f"/transactions/{e['id']}").json()["type"] == "expense"


def test_income_cannot_be_split(world):
    i = income(world, amount="100.00")
    r = patch(world, i["id"], yourShare="40.00", splits=shares(world, ("rahul", "60.00")))
    assert r.status_code == 422


def test_an_expense_with_a_refund_cannot_be_split(world):
    e = expense(world, amount="100.00")
    world.api.post("/transactions", json={"type": "refund", "refundOfId": e["id"], "amount": "10.00",
                                          "description": "Refund", "date": "2026-03-10"})
    r = patch(world, e["id"], yourShare="40.00", splits=shares(world, ("rahul", "60.00")))
    assert r.status_code == 409 and "refund" in r.json()["detail"].lower()


# ------------------------------------------------------------- split -> expense ---
@pytest.mark.parametrize("mode", ["DIRECT", "STRICT"])
def test_a_split_can_be_edited_back_into_a_plain_expense(world, mode):
    world.set_mode(mode)
    s = split(world)
    assert world.friend_balance("rahul") > 0
    r = patch(world, s["id"], splits=[])
    assert r.status_code == 200, r.text
    assert r.json()["type"] == "expense" and r.json()["amount"]["points"] == s["amount"]["points"]
    assert world.friend_balance("rahul") == 0


def test_unsplitting_is_guarded_when_the_friend_already_settled(world):
    s = split(world)
    settle(world, amount="100.00")
    assert patch(world, s["id"], splits=[]).status_code == 409
    r = patch(world, s["id"], splits=[], force=True)
    assert r.status_code == 200 and r.json()["type"] == "expense"


# ------------------------------------------- settlements on Income / Expense lists ---
def test_settlement_direction_filter_separates_money_in_from_money_out(world):
    split(world)                                           # Rahul owes you
    got = settle(world, amount="100.00")
    fronted(world, friend="priya", amount="50.00")           # you owe Priya
    paid = settle(world, friend="priya", amount="50.00")
    assert got["direction"] == "receive" and paid["direction"] == "pay"

    def ids(**params):
        r = world.api.get("/transactions", params=params)
        assert r.status_code == 200, r.text
        return {i["id"] for i in r.json()["items"]}

    income_side = ids(type=["income", "settlement"], settlementDirection="receive")
    assert got["id"] in income_side and paid["id"] not in income_side
    expense_side = ids(type=["expense", "refund", "settlement"], settlementDirection="pay")
    assert paid["id"] in expense_side and got["id"] not in expense_side
    # only settlements are narrowed: income and expenses still come through
    inc = income(world)
    exp = expense(world)
    assert inc["id"] in ids(type=["income", "settlement"], settlementDirection="receive")
    assert exp["id"] in ids(type=["expense", "refund", "settlement"], settlementDirection="pay")
    assert inc["id"] not in expense_side and exp["id"] not in income_side
    assert world.api.get("/transactions", params={"settlementDirection": "sideways"}).status_code == 422


def test_settlements_do_not_count_as_income_or_spending_in_group_totals(world):
    split(world)
    settle(world, amount="100.00")
    r = world.api.get("/transactions/groups", params={"groupBy": "type", "type": ["settlement"]})
    assert r.status_code == 200
    for g in r.json()["groups"]:
        for t in g["totals"]:
            assert t["moneyIn"]["points"] == 0 and t["moneyOut"]["points"] == 0


# ------------------------------------------------------------------ delete ---
def test_deleting_a_settlement_restores_what_the_friend_owes(world):
    split(world)
    owed = world.friend_balance("rahul")
    bank = world.balance("bank")
    s = settle(world, amount="100.00")
    assert world.friend_balance("rahul") == owed - 10_000
    r = world.api.delete(f"/transactions/{s['id']}")
    assert r.status_code == 200, r.text
    assert world.friend_balance("rahul") == owed and world.balance("bank") == bank
    listed = world.api.get("/transactions", params={"type": "settlement"}).json()["items"]
    assert s["id"] not in {i["id"] for i in listed}


def test_deleting_a_repayment_makes_the_fronted_expense_unpaid_again(world):
    f = fronted(world, friend="rahul", amount="50.00")
    s = settle(world, friend="rahul", amount="50.00")
    assert world.api.get(f"/transactions/{f['id']}").json()["unpaid"]["points"] == 0
    assert world.api.delete(f"/transactions/{s['id']}").status_code == 200
    assert world.api.get(f"/transactions/{f['id']}").json()["unpaid"]["points"] == 5_000
