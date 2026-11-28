"""STRICT ledger mode: nothing posted is edited or deleted; corrections are reversals."""
import pytest

from tests.support.sample_data import OPENING_BALANCE_POINTS as OPEN


@pytest.fixture()
def strict(world):
    world.set_mode("STRICT")
    return world


def test_mode_switch_and_validation(world):
    assert world.api.patch("/owner", json={"ledger_mode": "STRICT"}).json()["ledgerMode"] == "STRICT"
    assert world.api.patch("/owner", json={"ledger_mode": "strict"}).status_code == 422   # exact-case pattern


def test_edit_reverses_original_and_posts_replacement(strict):
    e = strict.expense(amount="10.00")
    new = strict.api.patch(f"/transactions/{e['id']}", json={"amount": "25.00"}).json()
    assert new["id"] != e["id"] and new["status"] == "posted"
    assert new["correctionOf"] == e["id"]                      # replacement links back to the original
    assert strict.api.get(f"/transactions/{e['id']}").json()["replacedBy"] == new["id"]
    old = strict.entry(e["id"])
    assert old["status"] == "REVERSED" and old["reversedById"]
    rev = strict.entry(old["reversedById"])
    assert rev["entryType"] == "REVERSAL" and rev["reversalOfId"] == e["id"]
    assert strict.balance("bank") == OPEN - 2500


def test_delete_only_reverses(strict):
    e = strict.expense(amount="10.00")
    assert strict.api.delete(f"/transactions/{e['id']}").status_code == 200
    assert strict.entry(e["id"])["status"] == "REVERSED" and strict.balance("bank") == OPEN


def test_reversed_entries_are_hidden_unless_requested(strict):
    e = strict.expense(title="Gone")
    strict.api.delete(f"/transactions/{e['id']}")
    default = {i["description"] for i in strict.api.get("/transactions").json()["items"]}
    everything = strict.api.get("/transactions", params={"status": "all"}).json()["items"]
    assert "Gone" not in default and any(i["description"] == "Gone" and i["status"] == "reversed" for i in everything)
    # the system REVERSAL row is an implementation detail and never appears in the flat API
    assert all(i["type"] != "reversal" and not i["description"].startswith("Reversal of") for i in everything)
    reversal_id = strict.entry(e["id"])["reversedById"]
    assert strict.api.get(f"/transactions/{reversal_id}").status_code == 404


def test_reversed_entries_cannot_be_edited_or_deleted_again(strict):
    e = strict.expense()
    strict.api.delete(f"/transactions/{e['id']}")
    assert strict.api.patch(f"/transactions/{e['id']}", json={"amount": "1"}).status_code == 409
    assert strict.api.delete(f"/transactions/{e['id']}").status_code == 409


def test_reversed_entries_do_not_count_in_reports(strict):
    e = strict.expense(amount="700.00")
    strict.api.delete(f"/transactions/{e['id']}")
    food = next(r for r in strict.api.get("/reports/spending").json() if r["categoryId"] == strict.cat["food"])
    assert food["total"]["points"] == 0


def test_strict_split_delete_keeps_statement_history_with_correct_running_balance(strict):
    sp = strict.split()["entry"]["id"]
    strict.api.delete(f"/splits/{sp}")
    rows = strict.api.get(f"/friends/{strict.friend['rahul']}/statement").json()
    assert [(r["entryType"], r["status"]) for r in rows] == [("SPLIT", "REVERSED"), ("REVERSAL", "POSTED")]
    assert rows[-1]["runningBalance"]["points"] == 0 and strict.friend_balance("rahul") == 0


def test_strict_refund_flow(strict):
    e = strict.expense(amount="100.00")
    rf = strict.api.post("/transactions/refund", json={"for_entry_id": e["id"], "amount": "40.00"}).json()
    strict.api.patch(f"/transactions/{rf['id']}", json={"amount": "60.00"})
    assert strict.balance("bank") == OPEN - 4000
    assert strict.api.delete(f"/transactions/{e['id']}").status_code == 409     # refunds block deletion here too


def test_strict_transfer_and_settlement_edit_delete(strict):
    strict.split()
    st = strict.settle(amount="100.00")
    tr = strict.transfer(amount="50.00")
    new_st = strict.api.patch(f"/settlements/{st['id']}", json={"note": "by cash"}).json()   # STRICT edit => new id
    assert new_st["id"] != st["id"] and new_st["settlesEntryId"] == st["settlesEntryId"]       # the link follows
    assert new_st["paymentGroup"] == st["paymentGroup"]
    assert strict.api.patch(f"/transfers/{tr['id']}", json={"amount": "75.00"}).status_code == 200
    assert strict.friend_balance("rahul") == 25_000 and strict.balance("wallet") == 7_500
    assert strict.bills()[0]["paid"]["points"] == 10_000                                       # still counted once
    assert strict.api.delete(f"/settlements/{new_st['id']}").status_code == 200
    assert strict.friend_balance("rahul") == 35_000 and strict.bills()[0]["paid"]["points"] == 0


def test_strict_correcting_a_bill_moves_its_payments_and_matches_to_the_new_entry(strict):
    sid = strict.split(shares=(("rahul", "350.00"),))["entry"]["id"]
    fid = strict.fronted(amount="50.00", title="Rickshaw")["entry"]["id"]
    m = strict.api.post("/matches", json={"friend_id": strict.friend["rahul"], "owed_to_me_id": sid,
                                          "owed_by_me_id": fid, "amount": "50.00"})
    assert m.status_code == 201, m.text
    strict.settle(amount="100.00")                       # Rahul pays 100 of the 300 left on the split
    r = strict.api.patch(f"/splits/{sid}", json={"friend_shares": [{"friend_id": strict.friend["rahul"], "amount": "400.00"}]})
    assert r.status_code == 200, r.text
    bills = {b["entryId"]: b for b in strict.bills(open_only=False)}
    new_id = next(i for i, b in bills.items() if b["type"] == "split")
    assert new_id != sid
    assert sid not in bills
    assert (bills[new_id]["paid"]["points"], bills[new_id]["matched"]["points"], bills[new_id]["remaining"]["points"]) \
        == (10_000, 5_000, 25_000)
    assert strict.api.get(f"/friends/{strict.friend['rahul']}/matches").json()[0]["owedToMe"]["entryId"] == new_id


def test_default_list_hides_both_halves_of_a_reversed_pair(strict):
    e = strict.expense(title="Oops")
    strict.api.delete(f"/transactions/{e['id']}")
    default = strict.api.get("/transactions").json()
    assert all(i["status"] == "posted" for i in default["items"])
    assert default["total"] == len(default["items"])
    full = strict.api.get("/transactions", params={"status": "all"}).json()
    assert full["total"] == default["total"] + 1               # the REVERSED original; REVERSAL stays hidden


def test_reports_and_trends_ignore_reversed_pairs(strict):
    e = strict.expense(amount="700.00")
    strict.api.delete(f"/transactions/{e['id']}")
    strict.expense(amount="100.00")
    cash = strict.api.get("/reports/trends/cashflow", params={"months": 1}).json()["points"][-1]
    assert cash["expense"]["points"] == 10_000
    food = next(b for b in strict.api.get("/reports/budget").json() if b["categoryId"] == strict.cat["food"])
    assert food["spent"]["points"] == 10_000
    nw = strict.api.get("/reports/trends/net-worth", params={"months": 1}).json()
    inr = next(s for s in nw if s["currency"] == "INR")
    assert inr["points"][-1]["value"]["points"] == 5_000_000 - 10_000
