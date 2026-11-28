"""The flat `/transactions` API the web app uses: one row per transaction,
every type creatable/editable/deletable from one body, filters + sorting +
paging server-side. The double-entry core is exercised underneath, and the
autouse invariant check validates the ledger after every test."""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import pytest

from tests.support.sample_data import OPENING_BALANCE_POINTS


def post(world, **body):
    return world.api.post("/transactions", json=body)


def ok(r, code=201):
    assert r.status_code == code, r.text
    return r.json()


def base(world, type_, **kw):
    return {"type": type_, "description": "Test", "amount": "100.00", "date": "2026-03-10", **kw}


# ------------------------------------------------------------------ create ---
def test_create_expense_and_income_flat_shape(world):
    e = ok(post(world, **base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"],
                              amount="250.50", memo="  lunch  ")))
    assert e["type"] == "expense" and e["amount"] == {"points": 25_050, "major": "INR 250.50", "currency": "INR"}
    assert e["accountId"] == world.acct["bank"] and e["categoryId"] == world.cat["food"]
    assert e["memo"] == "lunch" and e["date"] == "2026-03-10" and e["status"] == "posted"
    assert e["toAccountId"] is None and e["splits"] is None and e["yourShare"] is None
    assert world.balance("bank") == OPENING_BALANCE_POINTS - 25_050
    i = ok(post(world, **base(world, "income", accountId=world.acct["bank"], categoryId=world.cat["salary"])))
    assert i["type"] == "income" and i["categoryId"] == world.cat["salary"]


def test_create_transfer_with_memo(world):
    t = ok(post(world, **base(world, "transfer", accountId=world.acct["bank"], toAccountId=world.acct["wallet"],
                              memo="cash for the week")))
    assert t["type"] == "transfer" and t["accountId"] == world.acct["bank"] and t["toAccountId"] == world.acct["wallet"]
    assert t["memo"] == "cash for the week" and t["categoryId"] is None
    assert world.balance("wallet") == 10_000


def test_create_split_total_share_and_participants(world):
    s = ok(post(world, **base(world, "split", amount="500.00", accountId=world.acct["bank"],
                              categoryId=world.cat["food"], yourShare="150.00",
                              splits=[{"friendId": world.friend["rahul"], "share": "200.00"},
                                      {"friendId": world.friend["priya"], "share": "150.00"}])))
    assert s["type"] == "split" and s["amount"]["points"] == 50_000 and s["yourShare"]["points"] == 15_000
    assert {(x["friendId"], x["share"]["points"]) for x in s["splits"]} == {
        (world.friend["rahul"], 20_000), (world.friend["priya"], 15_000)}
    assert world.balance("bank") == OPENING_BALANCE_POINTS - 50_000
    assert world.friend_balance("rahul") == 20_000


def test_split_with_zero_own_share(world):
    s = ok(post(world, **base(world, "split", amount="100.00", accountId=world.acct["bank"],
                              categoryId=world.cat["food"], yourShare="0",
                              splits=[{"friendId": world.friend["rahul"], "share": "100.00"}])))
    assert s["yourShare"]["points"] == 0 and s["categoryId"] == world.cat["food"]


@pytest.mark.parametrize("your,shares", [("100.00", ["100.00"]), ("0", ["99.99"]), ("0", ["100.01"])])
def test_split_shares_must_add_up_exactly(world, your, shares):
    r = post(world, **base(world, "split", amount="150.00", accountId=world.acct["bank"],
                           categoryId=world.cat["food"], yourShare=your,
                           splits=[{"friendId": world.friend["rahul"], "share": x} for x in shares]))
    assert r.status_code == 422 and "add up" in r.json()["detail"]


def test_split_requires_a_friend_share(world):
    r = post(world, **base(world, "split", accountId=world.acct["bank"], categoryId=world.cat["food"],
                           yourShare="100.00", splits=[]))
    assert r.status_code == 422


def test_create_fronted(world):
    f = ok(post(world, **base(world, "fronted", amount="80.00", categoryId=world.cat["food"],
                              friendId=world.friend["rahul"])))
    assert f["type"] == "fronted" and f["friendId"] == world.friend["rahul"] and f["accountId"] is None
    assert world.friend_balance("rahul") == -8_000          # you owe Rahul


def test_create_refund_links_to_original(world):
    e = ok(post(world, **base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"])))
    r = ok(post(world, **base(world, "refund", amount="40.00", refundOfId=e["id"])))
    assert r["type"] == "refund" and r["refundOfId"] == e["id"] and r["accountId"] == world.acct["bank"]
    assert world.balance("bank") == OPENING_BALANCE_POINTS - 10_000 + 4_000
    assert post(world, **base(world, "refund", amount="100.00", refundOfId=e["id"])).status_code == 409  # > remainder


def test_settlements_are_not_created_through_the_flat_endpoint(world):
    world.split()
    r = post(world, **base(world, "settlement", amount="100.00", friendId=world.friend["rahul"],
                           accountId=world.acct["bank"]))
    assert r.status_code == 422 and "POST /settlements" in r.json()["detail"]
    assert world.friend_balance("rahul") == 35_000              # nothing was posted


def test_a_payment_to_a_friend_is_a_pay_settlement(world):
    f = world.fronted(friend="rahul", amount="50.00")["entry"]
    s = world.settle(amount="50.00")
    assert s["type"] == "settlement" and s["direction"] == "pay" and world.friend_balance("rahul") == 0
    assert world.api.get(f"/transactions/{f['id']}").json()["unpaid"]["points"] == 0


@pytest.mark.parametrize("account,direction,delta", [("bank", "increase", 5_000), ("bank", "decrease", -5_000),
                                                    ("card", "increase", 5_000), ("card", "decrease", -5_000)])
def test_adjustment_direction_moves_displayed_balance(world, account, direction, delta):
    before = world.balance(account)
    a = ok(post(world, **base(world, "adjustment", amount="50.00", accountId=world.acct[account],
                              direction=direction)))
    assert a["type"] == "adjustment" and a["direction"] == direction and a["categoryId"] is None
    assert world.balance(account) == before + delta


@pytest.mark.parametrize("body,field", [
    ({"type": "expense", "categoryId": 1}, "accountId"),
    ({"type": "expense", "accountId": 1}, "categoryId"),
    ({"type": "transfer", "accountId": 1}, "toAccountId"),
    ({"type": "refund"}, "refundOfId"),
    ({"type": "adjustment", "accountId": 1}, "direction"),
    ({"type": "fronted", "categoryId": 1}, "friendId"),
])
def test_missing_fields_are_named(world, body, field):
    r = post(world, description="x", amount="1.00", **body)
    assert r.status_code == 422 and field in r.json()["detail"]


@pytest.mark.parametrize("body", [{"type": "bogus"}, {"amount": ""}, {"amount": "abc"}, {"description": ""}, {"date": "junk"}])
def test_create_validation(world, body):
    payload = base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"])
    assert post(world, **{**payload, **body}).status_code == 422


def test_future_dates_are_rejected_but_today_is_fine(world):
    payload = base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"])
    today = dt.datetime.now(ZoneInfo("Asia/Kolkata")).date()          # the owner's timezone
    r = post(world, **{**payload, "date": (today + dt.timedelta(days=1)).isoformat()})
    assert r.status_code == 422 and "future" in r.json()["detail"]
    assert post(world, **{**payload, "date": today.isoformat()}).status_code == 201


def test_title_and_note_are_accepted_as_aliases(world):
    r = ok(post(world, type="expense", title="Aliased", note="n", amount="5.00", date="2026-03-01",
                accountId=world.acct["bank"], categoryId=world.cat["food"]))
    assert r["description"] == "Aliased" and r["memo"] == "n"


def test_unauthenticated_create_is_401(anon):
    assert anon.post("/transactions", json={}).status_code == 401


# --------------------------------------------------------------- read/detail ---
def test_get_by_id_and_404(world):
    e = ok(post(world, **base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"])))
    assert world.api.get(f"/transactions/{e['id']}").json() == e
    assert world.api.get("/transactions/999999").status_code == 404


def test_date_is_the_owners_local_date(world):
    """Entries are stored as UTC instants; the flat date is the Asia/Kolkata calendar day."""
    e = ok(post(world, **base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"],
                              date="2026-03-10")))
    raw = world.entry(e["id"])["entryDate"]
    assert raw.startswith("2026-03-09T18:30") and e["date"] == "2026-03-10"


def test_filter_refunds_by_the_expense_they_refund(world):
    a = ok(post(world, **base(world, "expense", description="A", accountId=world.acct["bank"], categoryId=world.cat["food"])))
    b = ok(post(world, **base(world, "expense", description="B", accountId=world.acct["bank"], categoryId=world.cat["food"])))
    ok(post(world, **base(world, "refund", description="refund of A", amount="10.00", refundOfId=a["id"])))
    ok(post(world, **base(world, "refund", description="refund of B", amount="5.00", refundOfId=b["id"])))
    got = world.api.get("/transactions", params={"refundOfId": a["id"]}).json()["items"]
    assert [i["description"] for i in got] == ["refund of A"] and got[0]["refundOfId"] == a["id"]


def test_postings_view_is_still_available(world):
    e = ok(post(world, **base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"])))
    detail = world.api.get(f"/transactions/{e['id']}/postings").json()
    assert {p["side"] for p in detail["postings"]} == {"DEBIT", "CREDIT"}


# --------------------------------------------------------------------- list ---
@pytest.fixture()
def populated(world):
    mk = lambda **kw: ok(post(world, **kw))
    world.rows = {
        "coffee": mk(**base(world, "expense", description="Coffee beans", amount="10.00", date="2026-01-10",
                            accountId=world.acct["bank"], categoryId=world.cat["food"], memo="airport 50%")),
        "bus": mk(**base(world, "expense", description="Bus ticket", amount="20.00", date="2026-02-10",
                         accountId=world.acct["wallet"], categoryId=world.cat["transport"])),
        "fuel": mk(**base(world, "expense", description="Petrol", amount="300.00", date="2026-02-15",
                          accountId=world.acct["bank"], categoryId=world.cat["fuel"])),
        "pay": mk(**base(world, "income", description="Freelance gig", amount="900.00", date="2026-02-20",
                         accountId=world.acct["bank"], categoryId=world.cat["freelance"])),
        "xfer": mk(**base(world, "transfer", description="To wallet", amount="50.00", date="2026-02-21",
                          accountId=world.acct["bank"], toAccountId=world.acct["wallet"])),
        "dinner": mk(**base(world, "split", description="Dinner", amount="400.00", date="2026-02-22",
                            accountId=world.acct["bank"], categoryId=world.cat["food"], yourShare="100.00",
                            splits=[{"friendId": world.friend["rahul"], "share": "300.00"}])),
    }
    return world


def names(world, **params):
    return [i["description"] for i in world.api.get("/transactions", params=params).json()["items"]]


def test_list_default_order_and_envelope(populated):
    page = populated.api.get("/transactions", params={"limit": 3}).json()
    assert set(page) == {"items", "total", "limit", "offset"} and page["total"] == 7   # +opening salary
    # the opening salary was posted "now", everything else is dated in the past
    assert [i["description"] for i in page["items"]] == ["Opening salary", "Dinner", "To wallet"]


def test_filter_by_flat_type(populated):
    assert set(names(populated, type="expense")) == {"Coffee beans", "Bus ticket", "Petrol"}
    assert set(names(populated, type=["expense", "income"])) == {
        "Coffee beans", "Bus ticket", "Petrol", "Freelance gig", "Opening salary"}
    assert names(populated, type="split") == ["Dinner"] and names(populated, type="transfer") == ["To wallet"]
    assert populated.api.get("/transactions", params={"type": "nope"}).status_code == 422


def test_filter_category_includes_subcategories(populated):
    assert set(names(populated, categoryId=populated.cat["transport"])) == {"Bus ticket", "Petrol"}
    assert names(populated, categoryId=populated.cat["fuel"]) == ["Petrol"]


def test_filter_by_account_friend_and_search(populated):
    assert set(names(populated, accountId=populated.acct["wallet"])) == {"Bus ticket", "To wallet"}
    assert names(populated, friendId=populated.friend["rahul"]) == ["Dinner"]
    assert names(populated, search="coffee") == ["Coffee beans"] and names(populated, search="airport") == ["Coffee beans"]
    assert names(populated, search="zzz") == []


def test_date_to_is_inclusive_of_the_whole_end_day(populated):
    assert "Bus ticket" in names(populated, dateTo="2026-02-10")
    assert "Bus ticket" not in names(populated, dateTo="2026-02-09")
    assert set(names(populated, dateFrom="2026-02-10", dateTo="2026-02-10")) == {"Bus ticket"}


def test_sorting(populated):
    assert names(populated, sort="amount", direction="desc", limit=2) == ["Opening salary", "Freelance gig"]
    amounts = [i["amount"]["points"] for i in populated.api.get(
        "/transactions", params={"sort": "amount", "direction": "asc"}).json()["items"]]
    assert amounts == sorted(amounts)
    desc = names(populated, sort="description", direction="asc")
    assert desc == sorted(desc, key=str.lower)
    assert populated.api.get("/transactions", params={"sort": "bogus"}).status_code == 422


def test_sorting_by_category_and_account_name(populated):
    cat_name = {c["id"]: c["name"].lower() for c in populated.api.get("/categories").json()}
    acct_name = {a["id"]: a["name"].lower() for a in populated.api.get("/accounts").json()}
    for direction in ("asc", "desc"):
        items = populated.api.get("/transactions", params={"sort": "category", "direction": direction}).json()["items"]
        keys = [cat_name.get(i["categoryId"], "") for i in items]
        assert keys == sorted(keys, reverse=direction == "desc")
        items = populated.api.get("/transactions", params={"sort": "account", "direction": direction}).json()["items"]
        keys = [acct_name.get(i["accountId"], "") for i in items]
        assert keys == sorted(keys, reverse=direction == "desc")


def test_paging_is_stable(populated):
    seen = []
    for off in range(0, 7, 3):
        seen += names(populated, limit=3, offset=off)
    assert len(seen) == 7 and len(set(seen)) == 7


# ------------------------------------------------------------------ grouping ---
PAST = {"dateFrom": "2026-01-01", "dateTo": "2026-02-28"}     # leaves out the opening salary (posted "now")


def grouped(world, group_by, **params):
    r = world.api.get("/transactions", params={"groupBy": group_by, **PAST, **params})
    assert r.status_code == 200, r.text
    return r.json()["items"]


def groups(world, group_by, **params):
    r = world.api.get("/transactions/groups", params={"groupBy": group_by, **PAST, **params})
    assert r.status_code == 200, r.text
    return r.json()["groups"]


def test_ungrouped_rows_have_no_group_key(populated):
    assert all(i["groupKey"] is None for i in populated.api.get("/transactions").json()["items"])


def test_group_by_date_clusters_newest_first(populated):
    items = grouped(populated, "date")
    assert [i["groupKey"] for i in items] == [i["date"] for i in items]
    assert [i["groupKey"] for i in items] == sorted((i["groupKey"] for i in items), reverse=True)
    older = grouped(populated, "date", direction="asc")
    assert [i["groupKey"] for i in older] == sorted(i["groupKey"] for i in older)


def test_group_by_month_and_summary_totals(populated):
    assert {i["groupKey"] for i in grouped(populated, "month")} == {"2026-01", "2026-02"}
    feb, jan = groups(populated, "month")                       # newest month first
    assert (feb["key"], jan["key"]) == ("2026-02", "2026-01")
    assert (feb["count"], jan["count"]) == (5, 1)
    assert feb["totals"][0]["moneyIn"]["points"] == 90_000       # Freelance gig
    assert feb["totals"][0]["moneyOut"]["points"] == 42_000      # Bus 20 + Petrol 300 + your 100 of the Dinner split (transfer excluded)
    assert jan["totals"][0]["moneyOut"]["points"] == 1_000


def test_split_counts_only_your_own_share_as_money_out(populated):
    ok(post(populated, **base(populated, "split", description="Paid for all", amount="900.00", date="2026-01-15",
                              accountId=populated.acct["bank"], categoryId=populated.cat["food"], yourShare="0",
                              splits=[{"friendId": populated.friend["rahul"], "share": "900.00"}])))
    jan = next(g for g in groups(populated, "month") if g["key"] == "2026-01")
    assert jan["count"] == 2 and jan["totals"][0]["moneyOut"]["points"] == 1_000     # a bill fully carried by a friend adds 0


def test_friend_paid_expense_counts_as_money_out_in_group_totals(populated):
    ok(post(populated, **base(populated, "fronted", description="Tea", amount="40.00", date="2026-01-12",
                              categoryId=populated.cat["food"], friendId=populated.friend["rahul"])))
    jan = next(g for g in groups(populated, "month") if g["key"] == "2026-01")
    assert jan["count"] == 2 and jan["totals"][0]["moneyOut"]["points"] == 5_000    # coffee 10 + tea 40


def test_group_by_category_is_alphabetical_with_labels(populated):
    items = grouped(populated, "category", type=["expense", "split"])
    assert [i["groupKey"] for i in items].count(str(populated.cat["food"])) == 2     # Coffee beans + Dinner
    labels = [g["label"] for g in groups(populated, "category", type=["expense", "split"])]
    assert labels == sorted(labels, key=str.lower)
    none = {g["key"]: g for g in groups(populated, "category")}[""]                  # the transfer has no category
    assert none["label"] == "No category" and none["count"] == 1


def test_group_by_account_uses_the_row_account(populated):
    keys = {i["description"]: i["groupKey"] for i in grouped(populated, "account")}
    assert keys["Bus ticket"] == str(populated.acct["wallet"])
    assert keys["To wallet"] == str(populated.acct["bank"])        # a transfer sits under the account it leaves
    assert all(keys[n] == str(populated.acct["bank"]) for n in ("Coffee beans", "Petrol", "Dinner"))
    assert {g["key"]: g["count"] for g in groups(populated, "account")} == {
        str(populated.acct["bank"]): 5, str(populated.acct["wallet"]): 1}
    assert "Wallet" in {g["label"] for g in groups(populated, "account")} or len(groups(populated, "account")) == 2


def test_group_by_type_and_rows_sorted_inside_a_group(populated):
    assert {g["key"]: g["count"] for g in groups(populated, "type")} == {
        "expense": 3, "income": 1, "transfer": 1, "split": 1}
    exp = [i["description"] for i in grouped(populated, "type", type="expense", sort="amount", direction="asc")]
    assert exp == ["Coffee beans", "Bus ticket", "Petrol"]


def test_grouped_paging_keeps_groups_contiguous(populated):
    seen = []
    for off in range(0, 6, 2):
        seen += [i["groupKey"] for i in populated.api.get(
            "/transactions", params={"groupBy": "month", "limit": 2, "offset": off, **PAST}).json()["items"]]
    assert seen == ["2026-02"] * 5 + ["2026-01"]


def test_groups_honour_filters_and_validate_group_by(populated):
    assert [(g["key"], g["count"]) for g in groups(populated, "month", search="coffee")] == [("2026-01", 1)]
    assert groups(populated, "month", search="zzz") == []
    assert populated.api.get("/transactions", params={"groupBy": "bogus"}).status_code == 422
    assert populated.api.get("/transactions/groups").status_code == 422
    assert populated.api.get("/transactions/groups", params={"groupBy": "bogus"}).status_code == 422


# ------------------------------------------------------- friend-fronted: unpaid ---
def fronted(world, amount, date, friend="rahul", cat="food"):
    return ok(post(world, **base(world, "fronted", amount=amount, date=date, categoryId=world.cat[cat],
                                 friendId=world.friend[friend])))


def pay_back(world, amount, friend="rahul"):
    return world.settle(friend=friend, amount=amount, direction="you_owe_them")


def unpaid(world, entry):
    return world.api.get(f"/transactions/{entry['id']}").json()["unpaid"]


def test_fronted_is_unpaid_until_paid_back(world):
    f = fronted(world, "80.00", "2026-03-10")
    assert f["unpaid"]["points"] == 8_000
    pay_back(world, "30.00")
    assert unpaid(world, f)["points"] == 5_000
    pay_back(world, "50.00")
    assert unpaid(world, f)["points"] == 0


def test_repayments_clear_the_oldest_fronted_first(world):
    old = fronted(world, "100.00", "2026-03-01")
    new = fronted(world, "60.00", "2026-03-20")
    pay_back(world, "120.00")                                    # oldest first: the old one and part of the new one
    assert unpaid(world, old)["points"] == 0 and unpaid(world, new)["points"] == 4_000
    listed = {i["id"]: i["unpaid"] for i in world.api.get("/transactions", params={"type": "fronted"}).json()["items"]}
    assert listed[old["id"]]["points"] == 0 and listed[new["id"]]["points"] == 4_000


def test_only_fronted_rows_have_unpaid_and_balances_are_per_friend(world):
    world.split()                                                # Rahul owes you 350 -> nets against what you owe
    fronted(world, "100.00", "2026-03-01", friend="rahul")
    fronted(world, "40.00", "2026-03-02", friend="priya")
    assert all(i["unpaid"] is None for i in world.api.get("/transactions", params={"type": "split"}).json()["items"])
    bal = {b["friendId"]: b for b in world.api.get("/friends/balances").json()}
    rahul, priya = bal[world.friend["rahul"]], bal[world.friend["priya"]]
    # net: he owes you 250, but nothing is matched, so the 100 he fronted is still an unpaid bill
    assert rahul["balance"]["points"] == 25_000 and rahul["frontedUnpaid"]["points"] == 10_000
    assert priya["balance"]["points"] == -4_000 and priya["frontedUnpaid"]["points"] == 4_000


def test_budget_marks_fronted_spend_not_paid_back(world):
    fronted(world, "80.00", "2026-03-10")
    fronted(world, "50.00", "2026-04-02")
    pay_back(world, "50.00")                                     # 130 fronted, 50 repaid oldest-first: 80 still owed
    food = lambda month: next(b for b in world.api.get("/reports/budget", params={"month": month}).json()
                              if b["categoryId"] == world.cat["food"])
    # the 50 repaid clears part of March's 80, so 30 of March and all of April's 50 are still unpaid
    assert food("2026-04")["notPaidBack"]["points"] == 5_000
    assert food("2026-03")["notPaidBack"]["points"] == 3_000
    assert food("2026-05")["notPaidBack"]["points"] == 0


def test_deleting_a_fronted_expense_drops_it_from_unpaid(world):
    f = fronted(world, "80.00", "2026-03-10")
    assert world.api.delete(f"/transactions/{f['id']}").status_code == 200
    assert world.api.get("/friends/balances").json()[0]["frontedUnpaid"]["points"] == 0


# --------------------------------------------------------------------- edit ---
def test_patch_expense_fields_and_clear_memo(world):
    e = ok(post(world, **base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"],
                              memo="keep me")))
    r = world.api.patch(f"/transactions/{e['id']}", json={"amount": "30.00", "description": "Edited"}).json()
    assert r["amount"]["points"] == 3_000 and r["description"] == "Edited" and r["memo"] == "keep me"
    assert world.api.patch(f"/transactions/{e['id']}", json={"memo": None}).json()["memo"] is None
    assert world.api.patch(f"/transactions/{e['id']}", json={"categoryId": None}).status_code == 422
    assert world.api.patch(f"/transactions/{e['id']}", json={"date": "2999-01-01"}).status_code == 422
    assert world.api.patch("/transactions/999999", json={"amount": "1.00"}).status_code == 404


def test_patch_transfer_and_memo(world):
    t = ok(post(world, **base(world, "transfer", accountId=world.acct["bank"], toAccountId=world.acct["wallet"])))
    out = world.api.patch(f"/transactions/{t['id']}", json={"amount": "40.00", "memo": "note"}).json()
    assert out["amount"]["points"] == 4_000 and out["memo"] == "note" and out["toAccountId"] == world.acct["wallet"]


def test_patch_split_recomputes_participants(world):
    s = ok(post(world, **base(world, "split", amount="500.00", accountId=world.acct["bank"],
                              categoryId=world.cat["food"], yourShare="150.00",
                              splits=[{"friendId": world.friend["rahul"], "share": "350.00"}]))) 
    out = world.api.patch(f"/transactions/{s['id']}", json={
        "amount": "600.00", "yourShare": "200.00",
        "splits": [{"friendId": world.friend["rahul"], "share": "400.00"}]}).json()
    assert out["amount"]["points"] == 60_000 and out["yourShare"]["points"] == 20_000
    assert world.friend_balance("rahul") == 40_000
    bad = world.api.patch(f"/transactions/{out['id']}", json={"amount": "700.00"})
    assert bad.status_code == 422 and "add up" in bad.json()["detail"]
    only_text = world.api.patch(f"/transactions/{out['id']}", json={"description": "Renamed"}).json()
    assert only_text["description"] == "Renamed" and only_text["amount"]["points"] == 60_000


def test_patch_fronted_and_settlement_and_adjustment(world):
    f = ok(post(world, **base(world, "fronted", amount="80.00", categoryId=world.cat["food"],
                              friendId=world.friend["rahul"])))
    assert world.api.patch(f"/transactions/{f['id']}", json={"amount": "60.00"}).json()["amount"]["points"] == 6_000
    a = ok(post(world, **base(world, "adjustment", amount="50.00", accountId=world.acct["bank"], direction="increase")))
    assert world.api.patch(f"/transactions/{a['id']}", json={"amount": "75.00"}).json()["direction"] == "increase"
    flip = world.api.patch(f"/transactions/{a['id']}", json={"direction": "decrease"})
    assert flip.status_code == 422 and "direction" in flip.json()["detail"]
    world.split()
    s = world.settle(amount="100.00")
    up = world.api.patch(f"/transactions/{s['id']}", json={"amount": "150.00"})
    assert up.status_code == 422                                 # a payment's amount is fixed: delete and re-enter
    note = world.api.patch(f"/transactions/{s['id']}", json={"memo": "cash"}).json()
    assert note["type"] == "settlement" and note["memo"] == "cash" and note["amount"]["points"] == 10_000


def test_edit_split_with_payments_needs_remove_linked(world):
    s = world.split()["entry"]
    world.settle(amount="100.00")
    # a rename touches no money, so it is allowed; lowering what Rahul owes below what he paid is not
    assert world.api.patch(f"/transactions/{s['id']}", json={"description": "Renamed"}).status_code == 200
    low = world.api.patch(f"/transactions/{s['id']}", json={
        "amount": "300.00", "yourShare": "250.00", "splits": [{"friendId": world.friend["rahul"], "share": "50.00"}]})
    assert low.status_code == 409
    again = world.api.patch(f"/transactions/{s['id']}", json={
        "amount": "300.00", "yourShare": "250.00", "splits": [{"friendId": world.friend["rahul"], "share": "50.00"}],
        "removeLinked": True})
    assert again.status_code == 200


# ------------------------------------------------------------------- delete ---
@pytest.mark.parametrize("kind", ["expense", "transfer", "split", "fronted", "adjustment"])
def test_delete_every_kind_restores_balances(world, kind):
    before = (world.balance("bank"), world.balance("wallet"), world.friend_balance("rahul"))
    kw = {
        "expense": dict(accountId=world.acct["bank"], categoryId=world.cat["food"]),
        "transfer": dict(accountId=world.acct["bank"], toAccountId=world.acct["wallet"]),
        "split": dict(accountId=world.acct["bank"], categoryId=world.cat["food"], yourShare="40.00",
                      splits=[{"friendId": world.friend["rahul"], "share": "60.00"}]),
        "fronted": dict(categoryId=world.cat["food"], friendId=world.friend["rahul"]),
        "adjustment": dict(accountId=world.acct["bank"], direction="increase"),
    }[kind]
    e = ok(post(world, **base(world, kind, **kw)))
    assert world.api.delete(f"/transactions/{e['id']}").status_code == 200
    assert (world.balance("bank"), world.balance("wallet"), world.friend_balance("rahul")) == before
    assert world.api.get(f"/transactions/{e['id']}").status_code == 404


def test_delete_settlement_and_guarded_split_delete(world):
    s = world.split()["entry"]
    st = world.settle(amount="100.00")
    assert world.api.delete(f"/transactions/{s['id']}").status_code == 409
    assert world.api.delete(f"/transactions/{s['id']}", params={"removeLinked": True}).status_code == 200
    assert world.api.get(f"/transactions/{st['id']}").status_code == 404      # its payments went with it


def test_delete_a_settlement(world):
    world.split()
    st = world.settle(amount="100.00")
    assert world.api.delete(f"/transactions/{st['id']}").status_code == 200
    assert world.friend_balance("rahul") == 35_000


# ------------------------------------------------------------------- STRICT ---
def test_strict_edit_and_delete_through_the_flat_api(world):
    world.set_mode("STRICT")
    e = ok(post(world, **base(world, "expense", accountId=world.acct["bank"], categoryId=world.cat["food"])))
    new = world.api.patch(f"/transactions/{e['id']}", json={"amount": "25.00"}).json()
    assert new["id"] != e["id"] and new["correctionOf"] == e["id"]
    assert world.api.get(f"/transactions/{e['id']}").json()["status"] == "reversed"
    assert world.api.get(f"/transactions/{e['id']}").json()["replacedBy"] == new["id"]
    assert e["id"] not in [i["id"] for i in world.api.get("/transactions").json()["items"]]
    assert world.api.delete(f"/transactions/{new['id']}").status_code == 200
    assert world.balance("bank") == OPENING_BALANCE_POINTS
    assert world.api.patch(f"/transactions/{e['id']}", json={"amount": "1.00"}).status_code == 409
