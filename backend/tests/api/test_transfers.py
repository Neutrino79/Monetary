import pytest

from tests.support.sample_data import OPENING_BALANCE_POINTS as OPEN


def net_worth_inr(world):
    return next(r for r in world.api.get("/reports/net-worth").json() if r["currency"] == "INR")["netWorth"]["points"]


def test_asset_to_asset_moves_money_without_changing_net_worth(world):
    before = net_worth_inr(world)
    t = world.transfer(amount="300.00")
    assert t["entryType"] == "TRANSFER" and t["description"] == "Transfer: Bank -> Wallet"
    assert (world.balance("bank"), world.balance("wallet")) == (OPEN - 30_000, 30_000)
    assert net_worth_inr(world) == before


def test_transfers_are_not_income_or_spending(world):
    world.transfer(amount="300.00")
    assert all(r["total"]["points"] == 0 for r in world.api.get("/reports/spending").json())
    assert sum(r["total"]["points"] for r in world.api.get("/reports/income").json()) == OPEN


def test_paying_off_a_credit_card(world):
    world.expense(account="card", amount="500.00")
    world.transfer(src="bank", dst="card", amount="200.00")
    assert world.balance("card") == 30_000 and world.balance("bank") == OPEN - 20_000


def test_cannot_overpay_or_pay_a_zero_balance_liability(world):
    r = world.api.post("/transfers", json={"from_account_id": world.acct["bank"], "to_account_id": world.acct["card"], "amount": "1"})
    assert r.status_code == 422 and "nothing owed" in r.json()["detail"]
    world.expense(account="card", amount="100.00")
    r = world.api.post("/transfers", json={"from_account_id": world.acct["bank"], "to_account_id": world.acct["card"], "amount": "100.01"})
    assert r.status_code == 422 and "overpay" in r.json()["detail"]
    world.transfer(src="bank", dst="card", amount="100.00")


@pytest.mark.parametrize("src,dst,code", [
    ("card", "bank", 422),       # drawing cash from a credit line
    ("bank", "bank", 422),       # same account
    ("bank", "usd", 422),        # cross-currency
])
def test_transfer_rejections(world, src, dst, code):
    world.expense(account="card", amount="10.00")
    r = world.api.post("/transfers", json={"from_account_id": world.acct[src], "to_account_id": world.acct[dst], "amount": "5"})
    assert r.status_code == code


def test_transfer_not_found_inactive_invalid(world):
    base = {"from_account_id": world.acct["bank"], "to_account_id": world.acct["wallet"], "amount": "5"}
    assert world.api.post("/transfers", json={**base, "to_account_id": 99999}).status_code == 404
    assert world.api.post("/transfers", json={**base, "to_account_id": world.cat["food"]}).status_code == 404   # a category
    assert world.api.post("/transfers", json={**base, "amount": "0"}).status_code == 422
    assert world.api.post("/transfers", json={**base, "date": "junk"}).status_code == 422
    world.api.post(f"/accounts/{world.acct['wallet']}/deactivate")
    assert world.api.post("/transfers", json=base).status_code == 422


def test_edit_transfer(world):
    t = world.transfer(amount="100.00")
    r = world.api.patch(f"/transfers/{t['id']}", json={"amount": "250.00", "description": "Top-up"})
    assert r.status_code == 200 and r.json()["description"] == "Top-up"
    assert world.balance("wallet") == 25_000
    assert world.api.patch(f"/transfers/{t['id']}", json={"to_account_id": world.acct["bank"]}).status_code == 422


def test_edit_transfer_to_liability_excludes_its_own_prior_paydown(world):
    world.expense(account="card", amount="100.00")
    t = world.transfer(src="bank", dst="card", amount="100.00")                # card fully paid
    assert world.api.patch(f"/transfers/{t['id']}", json={"amount": "60.00"}).status_code == 200
    assert world.balance("card") == 4_000
    assert world.api.patch(f"/transfers/{t['id']}", json={"amount": "100.01"}).status_code == 422


def test_delete_and_list_transfers(world):
    t = world.transfer(); world.transfer(amount="5.00")
    assert len(world.api.get("/transfers").json()) == 2
    assert world.api.delete(f"/transfers/{t['id']}").status_code == 200
    assert len(world.api.get("/transfers").json()) == 1
    assert world.api.delete(f"/transfers/{t['id']}").status_code == 404
    assert world.api.patch("/transfers/99999", json={"amount": "1"}).status_code == 404
    e = world.expense()["id"]
    assert world.api.delete(f"/transfers/{e}").status_code == 422
