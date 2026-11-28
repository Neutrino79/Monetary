"""Matches (netting a friend-paid bill against a split), the stack rule (bills <- matches <- payments),
and payments recorded before bills were settled one by one ("unassigned")."""
from __future__ import annotations

import glob
import sqlite3

import pytest


def match(world, to_me, by_me, amount, friend="rahul"):
    return world.api.post("/matches", json={"friendId": world.friend[friend], "owedToMeId": to_me,
                                            "owedByMeId": by_me, "amount": amount})


@pytest.fixture()
def pair(world):
    """Rahul owes you 350 (a split) and you owe Rahul 100 (he paid for you)."""
    split = world.split()["entry"]["id"]
    fronted = world.fronted(friend="rahul", amount="100.00")["entry"]["id"]
    return world, split, fronted


def bill(world, entry_id, friend="rahul"):
    return next(b for b in world.bills(friend, open_only=False) if b["entryId"] == entry_id)


def forget_links(api_data_dir):
    """Turn every settlement into a pre-migration one: tied to no bill."""
    for path in glob.glob(str(api_data_dir / "tenants" / "*.db")):
        conn = sqlite3.connect(path)
        conn.execute("UPDATE journal_entry SET settles_entry_id = NULL, payment_group = NULL")
        conn.commit()
        conn.close()


# ----------------------------------------------------------------- matches ---
def test_a_match_lowers_what_is_left_on_both_bills_and_moves_no_money(pair):
    world, split, fronted = pair
    balance, bank = world.friend_balance("rahul"), world.balance("bank")
    r = match(world, split, fronted, "100.00")
    assert r.status_code == 201, r.text
    assert r.json()["amount"]["points"] == 10_000 and r.json()["locked"] is False
    assert bill(world, split)["remaining"]["points"] == 25_000 and bill(world, split)["matched"]["points"] == 10_000
    assert bill(world, fronted)["remaining"]["points"] == 0 and bill(world, fronted)["status"] == "paid"
    assert world.friend_balance("rahul") == balance and world.balance("bank") == bank
    listed = world.api.get(f"/friends/{world.friend['rahul']}/matches").json()
    assert [m["id"] for m in listed] == [r.json()["id"]]


def test_matching_the_same_pair_again_adds_to_it(pair):
    world, split, fronted = pair
    first = match(world, split, fronted, "30.00").json()
    second = match(world, split, fronted, "20.00").json()
    assert second["id"] == first["id"] and second["amount"]["points"] == 5_000


@pytest.mark.parametrize("amount", ["100.01", "0.00", "-5.00"])
def test_a_match_cannot_exceed_what_is_left_or_be_empty(pair, amount):
    world, split, fronted = pair
    assert match(world, split, fronted, amount).status_code in (409, 422)
    assert world.api.get(f"/friends/{world.friend['rahul']}/matches").json() == []


def test_a_match_needs_the_right_kind_of_bill_for_the_same_friend(pair):
    world, split, fronted = pair
    assert match(world, fronted, split, "10.00").status_code == 422          # arguments the wrong way round
    other = world.fronted(friend="priya", amount="40.00")["entry"]["id"]
    assert match(world, split, other, "10.00").status_code == 422            # a different friend's bill
    assert match(world, split, 99_999, "10.00").status_code == 422


def test_a_match_can_be_changed_and_removed(pair):
    world, split, fronted = pair
    m = match(world, split, fronted, "60.00").json()
    up = world.api.patch(f"/matches/{m['id']}", json={"amount": "80.00"})
    assert up.status_code == 200 and up.json()["amount"]["points"] == 8_000
    assert world.api.patch(f"/matches/{m['id']}", json={"amount": "100.01"}).status_code == 409
    assert world.api.patch("/matches/999", json={"amount": "1.00"}).status_code == 404
    assert world.api.delete(f"/matches/{m['id']}").status_code == 200
    assert bill(world, fronted)["remaining"]["points"] == 10_000
    assert world.api.delete(f"/matches/{m['id']}").status_code == 404


def test_deleting_a_bill_removes_its_matches_without_touching_money(pair):
    world, split, fronted = pair
    match(world, split, fronted, "100.00")
    assert world.api.delete(f"/transactions/{fronted}").status_code == 200
    assert world.api.get(f"/friends/{world.friend['rahul']}/matches").json() == []
    assert bill(world, split)["remaining"]["points"] == 35_000


# --------------------------------------------------------------- stack rule ---
def test_payments_lock_the_match_beneath_them(pair):
    world, split, fronted = pair
    m = match(world, split, fronted, "100.00").json()
    pay = world.settle(amount="50.00", direction="they_owe_you")
    assert world.api.get(f"/friends/{world.friend['rahul']}/matches").json()[0]["locked"] is True
    for call in (lambda: world.api.patch(f"/matches/{m['id']}", json={"amount": "10.00"}),
                 lambda: world.api.delete(f"/matches/{m['id']}")):
        r = call()
        assert r.status_code == 409 and r.json()["error_type"] == "BillDependencyError"
        assert r.json()["details"]["payments"][0]["id"] == pay["id"]
    assert world.api.delete(f"/matches/{m['id']}", params={"removeLinked": True}).status_code == 200
    assert world.api.get(f"/transactions/{pay['id']}").status_code == 404     # the payment went with it
    assert bill(world, split)["remaining"]["points"] == 35_000


def test_a_bill_cannot_drop_below_what_is_matched_and_paid(pair):
    world, split, fronted = pair
    match(world, split, fronted, "100.00")
    world.settle(amount="50.00", direction="they_owe_you")
    lower = {"amount": "300.00", "yourShare": "250.00",
             "splits": [{"friendId": world.friend["rahul"], "share": "50.00"}]}
    r = world.api.patch(f"/transactions/{split}", json=lower)
    assert r.status_code == 409 and r.json()["error_type"] == "BillDependencyError"
    done = world.api.patch(f"/transactions/{split}", json={**lower, "removeLinked": True})
    assert done.status_code == 200, done.text
    assert world.friend_balance("rahul") == 5_000 - 10_000


# --------------------------------------------- payments from before bills ---
def test_old_payments_are_unassigned_and_block_new_ones_until_linked(world, api_data_dir):
    world.split()
    pay = world.settle(amount="100.00")
    forget_links(api_data_dir)
    fid = world.friend["rahul"]
    old = world.api.get(f"/friends/{fid}/unassigned-payments").json()
    assert [p["id"] for p in old] == [pay["id"]]
    open_bill = world.bills()[0]
    blocked = world.pay([(open_bill["entryId"], "10.00")])
    assert blocked.status_code == 409 and "not tied to a bill" in blocked.json()["detail"]
    ok = world.api.post(f"/settlements/{pay['id']}/assign",
                        json={"allocations": [{"billId": open_bill["entryId"], "amount": "100.00"}]})
    assert ok.status_code == 200, ok.text
    assert world.api.get(f"/friends/{fid}/unassigned-payments").json() == []
    assert bill(world, open_bill["entryId"])["paid"]["points"] == 10_000
    assert world.pay([(open_bill["entryId"], "10.00")]).status_code == 201


def test_one_old_payment_can_be_split_across_bills(world, api_data_dir):
    a = world.split(title="First")["entry"]["id"]
    b = world.split(title="Second")["entry"]["id"]
    pay = world.settle(amount="350.00")                 # one entry, for one bill
    forget_links(api_data_dir)
    r = world.api.post(f"/settlements/{pay['id']}/assign", json={"allocations": [
        {"billId": a, "amount": "250.00"}, {"billId": b, "amount": "100.00"}]})
    assert r.status_code == 200, r.text
    assert len(r.json()["transactions"]) == 2 and r.json()["paymentGroup"]
    assert bill(world, a)["paid"]["points"] == 25_000 and bill(world, b)["paid"]["points"] == 10_000
    assert world.friend_balance("rahul") == 70_000 - 35_000


def test_assign_rejections(world, api_data_dir):
    split = world.split()["entry"]["id"]
    fronted = world.fronted(friend="rahul", amount="150.00")["entry"]["id"]
    pay = world.settle(amount="100.00", direction="they_owe_you")
    forget_links(api_data_dir)

    def assign(*pairs):
        return world.api.post(f"/settlements/{pay['id']}/assign", json={
            "allocations": [{"billId": b, "amount": a} for b, a in pairs]})
    assert assign((split, "90.00")).status_code == 422          # must add up to the payment
    assert assign((fronted, "100.00")).status_code == 422       # money came in: it pays what they owed you
    assert assign((split, "100.00")).status_code == 200
    assert assign((split, "100.00")).status_code == 409         # already tied
    assert world.api.post("/settlements/99999/assign", json={
        "allocations": [{"billId": split, "amount": "1.00"}]}).status_code == 404
