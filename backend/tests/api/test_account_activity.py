"""Per-account statement with running balance, last-activity date, and reconciling with the bank."""
from __future__ import annotations


def make(world, type_, **kw):
    r = world.api.post("/transactions", json={"type": type_, "description": "Test", "amount": "100.00", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def statement(world, account="bank"):
    r = world.api.get(f"/accounts/{world.acct[account]}/statement")
    assert r.status_code == 200, r.text
    return r.json()


def test_statement_lists_postings_with_running_balance(world):
    make(world, "income", description="Pay", amount="1000.00", date="2026-03-01",
         accountId=world.acct["bank"], categoryId=world.cat["salary"])
    make(world, "expense", description="Lunch", amount="150.00", date="2026-03-02",
         accountId=world.acct["bank"], categoryId=world.cat["food"])
    rows = statement(world)
    by = {r["description"]: r for r in rows}
    names = [r["description"] for r in rows]
    assert names.index("Pay") < names.index("Lunch")            # date order (the seeded opening salary is "now")
    assert by["Lunch"]["delta"]["points"] == -15_000 and by["Pay"]["delta"]["points"] == 100_000
    assert by["Lunch"]["runningBalance"]["points"] == by["Pay"]["runningBalance"]["points"] - 15_000
    assert by["Lunch"]["date"] == "2026-03-02"
    assert rows[-1]["runningBalance"]["points"] == world.balance("bank")      # last row = current balance


def test_liability_statement_counts_the_amount_owed(world):
    make(world, "expense", description="Gadget", amount="200.00", date="2026-03-02",
         accountId=world.acct["card"], categoryId=world.cat["food"])
    last = statement(world, "card")[-1]
    assert last["delta"]["points"] == 20_000 and last["runningBalance"]["points"] == 20_000


def test_deleted_entries_drop_out_of_the_statement(world):
    e = make(world, "expense", description="Oops", amount="10.00", date="2026-03-02",
             accountId=world.acct["bank"], categoryId=world.cat["food"])
    assert world.api.delete(f"/transactions/{e['id']}").status_code in (200, 204)
    rows = statement(world)
    assert "Oops" not in [r["description"] for r in rows]
    assert rows[-1]["runningBalance"]["points"] == world.balance("bank")


def test_statement_of_unknown_account_is_404(world):
    assert world.api.get("/accounts/999999/statement").status_code == 404


def test_accounts_carry_their_last_activity_date(world):
    make(world, "expense", description="Late", amount="10.00", date="2026-03-05",
         accountId=world.acct["wallet"], categoryId=world.cat["food"])
    accounts = {a["id"]: a for a in world.api.get("/accounts").json()}
    assert accounts[world.acct["wallet"]]["lastActivity"] == "2026-03-05"
    assert accounts[world.acct["card"]]["lastActivity"] is None


def test_reconcile_posts_the_difference_as_an_adjustment(world):
    before = world.balance("bank")
    r = world.api.post(f"/accounts/{world.acct['bank']}/reconcile", json={"balance": f"{(before + 2_550) / 100:.2f}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["difference"]["points"] == 2_550 and body["entryId"]
    assert world.balance("bank") == before + 2_550
    # lower than the ledger: a decrease
    r = world.api.post(f"/accounts/{world.acct['bank']}/reconcile", json={"balance": f"{before / 100:.2f}"})
    assert r.json()["difference"]["points"] == -2_550 and world.balance("bank") == before


def test_reconcile_with_nothing_to_fix_posts_nothing(world):
    now = world.balance("bank")
    r = world.api.post(f"/accounts/{world.acct['bank']}/reconcile", json={"balance": f"{now / 100:.2f}"})
    assert r.json() == {"difference": {"points": 0, "major": r.json()["difference"]["major"], "currency": "INR"}, "entryId": None}


def test_reconcile_a_credit_card_sets_the_amount_owed(world):
    r = world.api.post(f"/accounts/{world.acct['card']}/reconcile", json={"balance": "340.00"})
    assert r.status_code == 200, r.text
    assert world.balance("card") == 34_000
    assert statement(world, "card")[-1]["description"] == "Reconciled with card statement"


def test_reconcile_rejects_bad_balances(world):
    for bad in ("-5", "abc", ""):
        r = world.api.post(f"/accounts/{world.acct['bank']}/reconcile", json={"balance": bad})
        assert r.status_code in (400, 422), (bad, r.text)
