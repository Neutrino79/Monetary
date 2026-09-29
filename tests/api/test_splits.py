import pytest

from tests.sample_data import OPENING_BALANCE_POINTS as OPEN


def spent(world, key="food"):
    return next(r for r in world.api.get("/reports/spending").json() if r["category_id"] == world.cat[key])["total"]["points"]


def test_split_charges_payer_full_amount_but_spend_only_owner_share(world):
    s = world.split(owner_share="150.00", shares=(("rahul", "350.00"),))
    assert s["entry"]["entry_type"] == "SPLIT" and s["entry"]["amount"]["points"] == 50_000
    assert world.balance("bank") == OPEN - 50_000
    assert world.friend_balance("rahul") == 35_000
    assert spent(world) == 15_000                       # friends' share is never "my spend"


def test_split_participants_payload(world):
    p = world.split()["participants"]
    assert [(x["friend_name"], x["is_owner"], x["share"]["major"]) for x in p] == [
        ("(you)", True, "150.00"), ("Rahul Sharma", False, "350.00")]


def test_multi_friend_split(world):
    world.split(owner_share="100.00", shares=(("rahul", "200.00"), ("priya", "300.00")))
    assert (world.friend_balance("rahul"), world.friend_balance("priya")) == (20_000, 30_000)


def test_zero_owner_share_split_keeps_category(world):
    s = world.split(owner_share="0", shares=(("rahul", "100.00"),))
    assert s["entry"]["category_id"] == world.cat["food"]
    assert [x["is_owner"] for x in s["participants"]] == [False] and spent(world) == 0


def test_fronted_expense_is_full_spend_and_owed_to_friend(world):
    f = world.fronted(amount="50.00")
    assert f["entry"]["entry_type"] == "FRONTED" and [x["is_owner"] for x in f["participants"]] == [False]
    assert world.friend_balance("rahul") == -5_000 and spent(world) == 5_000
    assert world.balance("bank") == OPEN                # no account of mine was touched


def test_split_and_fronted_net_against_each_other(world):
    world.split(); world.fronted(amount="50.00")
    assert world.friend_balance("rahul") == 30_000


@pytest.mark.parametrize("mutate,code", [
    (lambda w, p: p.update(friend_shares=[]), 422),
    (lambda w, p: p.update(friend_shares=p["friend_shares"] * 2), 422),                      # duplicate friend
    (lambda w, p: p["friend_shares"][0].update(friend_id=99999), 404),
    (lambda w, p: p["friend_shares"][0].update(friend_id=1), 404),                            # id 1 is the owner
    (lambda w, p: p["friend_shares"][0].update(amount="0"), 422),
    (lambda w, p: p.update(owner_share="-1"), 422),
    (lambda w, p: p.update(owner_share="abc"), 422),
    (lambda w, p: p.update(category_id=w.cat["salary"]), 404),                                # not an expense category
    (lambda w, p: p.update(account_id=w.acct["usd"]), 422),                                   # currency mismatch
    (lambda w, p: p.update(title=""), 422),
])
def test_split_rejections(world, mutate, code):
    p = world.split_payload()
    mutate(world, p)
    assert world.api.post("/splits", json=p).status_code == code


def test_split_with_friend_in_other_currency_rejected(world):
    usd = world.api.post("/friends", json={"name": "Sam", "email": "sam@example.com", "currency": "USD"}).json()["id"]
    r = world.api.post("/splits", json={**world.split_payload(), "friend_shares": [{"friend_id": usd, "amount": "10"}]})
    assert r.status_code == 422


def test_get_split(world):
    sid = world.split()["entry"]["id"]
    assert len(world.api.get(f"/splits/{sid}").json()["participants"]) == 2
    assert world.api.get("/splits/99999").status_code == 404
    assert world.api.get(f"/splits/{world.expense()['id']}").status_code == 422     # not a split


def test_list_splits_and_type_filter(world):
    world.split(); world.fronted()
    assert len(world.api.get("/splits").json()) == 2
    assert [e["entry_type"] for e in world.api.get("/splits", params={"type": "FRONTED"}).json()] == ["FRONTED"]
    assert world.api.get("/splits", params={"type": "NORMAL"}).status_code == 422


def test_edit_split_shares_and_account(world):
    sid = world.split()["entry"]["id"]
    r = world.api.patch(f"/splits/{sid}", json={"owner_share": "100.00", "account_id": world.acct["wallet"],
                                               "friend_shares": [{"friend_id": world.friend["rahul"], "amount": "200.00"},
                                                                 {"friend_id": world.friend["priya"], "amount": "100.00"}]})
    assert r.status_code == 200 and len(r.json()["participants"]) == 3
    assert (world.balance("bank"), world.balance("wallet")) == (OPEN, -40_000)
    assert (world.friend_balance("rahul"), world.friend_balance("priya")) == (20_000, 10_000)


def test_edit_split_partial_body_keeps_other_fields(world):
    sid = world.split()["entry"]["id"]
    world.api.patch(f"/splits/{sid}", json={"title": "Renamed"})
    assert world.friend_balance("rahul") == 35_000 and world.entry(sid)["description"] == "Renamed"


def test_edit_fronted_amount_and_friend(world):
    fid = world.fronted(amount="50.00")["entry"]["id"]
    assert world.api.patch(f"/splits/{fid}", json={"amount": "80.00", "friend_id": world.friend["priya"]}).status_code == 200
    assert world.friend_balance("priya") == -8_000 and world.friend_balance("rahul") == 0


def test_edit_and_delete_missing_split(world):
    assert world.api.patch("/splits/99999", json={"title": "x"}).status_code == 404
    assert world.api.delete("/splits/99999").status_code == 404
    e = world.expense()["id"]
    assert world.api.patch(f"/splits/{e}", json={"title": "x"}).status_code in (404, 422)


def test_settlement_history_guards_edit_and_delete(world):
    sid = world.split()["entry"]["id"]
    world.settle(amount="100.00")
    r = world.api.patch(f"/splits/{sid}", json={"owner_share": "40.00"})
    assert r.status_code == 409 and "settlement" in r.json()["detail"]
    assert world.api.delete(f"/splits/{sid}").status_code == 409
    assert world.api.patch(f"/splits/{sid}", json={"owner_share": "40.00"}).status_code == 409


def test_force_edit_keeps_settlement_history(world):
    sid = world.split()["entry"]["id"]
    world.settle(amount="100.00")
    assert world.api.patch(f"/splits/{sid}", json={"friend_shares": [{"friend_id": world.friend["rahul"], "amount": "200.00"}], "force": True}).status_code == 200
    assert world.friend_balance("rahul") == 10_000 and len(world.api.get("/settlements").json()) == 1


def test_remove_settlements_then_delete(world):
    sid = world.split()["entry"]["id"]
    world.settle(amount="100.00")
    assert world.api.delete(f"/splits/{sid}", params={"remove_settlements": True}).status_code == 200
    assert world.api.get("/settlements").json() == [] and world.friend_balance("rahul") == 0
    assert world.balance("bank") == OPEN


def test_delete_split_without_history(world):
    sid = world.split()["entry"]["id"]
    assert world.api.delete(f"/splits/{sid}").status_code == 200
    assert world.balance("bank") == OPEN and world.friend_balance("rahul") == 0
