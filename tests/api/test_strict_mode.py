"""STRICT ledger mode: nothing posted is edited or deleted; corrections are reversals."""
import pytest

from tests.sample_data import OPENING_BALANCE_POINTS as OPEN


@pytest.fixture()
def strict(world):
    world.set_mode("STRICT")
    return world


def test_mode_switch_and_validation(world):
    assert world.api.patch("/owner", json={"ledger_mode": "STRICT"}).json()["ledger_mode"] == "STRICT"
    assert world.api.patch("/owner", json={"ledger_mode": "strict"}).status_code == 422   # exact-case pattern


def test_edit_reverses_original_and_posts_replacement(strict):
    e = strict.expense(amount="10.00")
    new = strict.api.patch(f"/transactions/{e['id']}", json={"amount": "25.00"}).json()
    assert new["id"] != e["id"] and new["status"] == "POSTED"
    old = strict.entry(e["id"])
    assert old["status"] == "REVERSED" and old["reversed_by_id"]
    rev = strict.entry(old["reversed_by_id"])
    assert rev["entry_type"] == "REVERSAL" and rev["reversal_of_id"] == e["id"]
    assert strict.balance("bank") == OPEN - 2500


def test_delete_only_reverses(strict):
    e = strict.expense(amount="10.00")
    assert strict.api.delete(f"/transactions/{e['id']}").status_code == 200
    assert strict.entry(e["id"])["status"] == "REVERSED" and strict.balance("bank") == OPEN


def test_reversed_entries_are_hidden_unless_requested(strict):
    e = strict.expense(title="Gone")
    strict.api.delete(f"/transactions/{e['id']}")
    default = {i["description"] for i in strict.api.get("/transactions").json()["items"]}
    everything = strict.api.get("/transactions", params={"include_reversed": True}).json()["items"]
    assert "Gone" not in default and any(i["description"] == "Gone" for i in everything)
    assert any(i["entry_type"] == "REVERSAL" for i in everything)


def test_reversed_entries_cannot_be_edited_or_deleted_again(strict):
    e = strict.expense()
    strict.api.delete(f"/transactions/{e['id']}")
    assert strict.api.patch(f"/transactions/{e['id']}", json={"amount": "1"}).status_code == 409
    assert strict.api.delete(f"/transactions/{e['id']}").status_code == 409


def test_reversed_entries_do_not_count_in_reports(strict):
    e = strict.expense(amount="700.00")
    strict.api.delete(f"/transactions/{e['id']}")
    food = next(r for r in strict.api.get("/reports/spending").json() if r["category_id"] == strict.cat["food"])
    assert food["total"]["points"] == 0


def test_strict_split_delete_keeps_statement_history_with_correct_running_balance(strict):
    sp = strict.split()["entry"]["id"]
    strict.api.delete(f"/splits/{sp}")
    rows = strict.api.get(f"/friends/{strict.friend['rahul']}/statement").json()
    assert [(r["entry_type"], r["status"]) for r in rows] == [("SPLIT", "REVERSED"), ("REVERSAL", "POSTED")]
    assert rows[-1]["running_balance"]["points"] == 0 and strict.friend_balance("rahul") == 0


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
    new_st = strict.api.patch(f"/settlements/{st['id']}", json={"amount": "150.00"}).json()   # STRICT edit => new id
    assert strict.api.patch(f"/transfers/{tr['id']}", json={"amount": "75.00"}).status_code == 200
    assert strict.friend_balance("rahul") == 20_000 and strict.balance("wallet") == 7_500
    assert strict.api.delete(f"/settlements/{new_st['id']}").status_code == 200
    assert strict.friend_balance("rahul") == 35_000


def test_default_list_hides_both_halves_of_a_reversed_pair(strict):
    e = strict.expense(title="Oops")
    strict.api.delete(f"/transactions/{e['id']}")
    default = strict.api.get("/transactions").json()
    assert all(i["entry_type"] != "REVERSAL" and i["status"] == "POSTED" for i in default["items"])
    assert default["total"] == len(default["items"])
    full = strict.api.get("/transactions", params={"include_reversed": True}).json()
    assert full["total"] == default["total"] + 2


def test_reports_and_trends_ignore_reversed_pairs(strict):
    e = strict.expense(amount="700.00")
    strict.api.delete(f"/transactions/{e['id']}")
    strict.expense(amount="100.00")
    cash = strict.api.get("/reports/trends/cashflow", params={"months": 1}).json()["points"][-1]
    assert cash["expense"]["points"] == 10_000
    food = next(b for b in strict.api.get("/reports/budget").json() if b["category_id"] == strict.cat["food"])
    assert food["spent"]["points"] == 10_000
    nw = strict.api.get("/reports/trends/net-worth", params={"months": 1}).json()
    inr = next(s for s in nw if s["currency"] == "INR")
    assert inr["points"][-1]["value"]["points"] == 5_000_000 - 10_000
