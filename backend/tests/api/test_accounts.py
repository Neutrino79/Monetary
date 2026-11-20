import pytest


# --------------------------------------------------------------- accounts ---
def test_create_and_list_accounts(api):
    r = api.post("/accounts", json={"name": "Bank", "type": "ASSET", "currency": "inr"})
    assert r.status_code == 201 and r.json()["currencyCode"] == "INR" and r.json()["isActive"] is True
    assert [a["name"] for a in api.get("/accounts").json()] == ["Bank"]


def test_duplicate_account_names_rejected_case_insensitively_per_type(api):
    api.post("/accounts", json={"name": "Bank", "type": "ASSET", "currency": "INR"})
    assert api.post("/accounts", json={"name": "BANK", "type": "ASSET", "currency": "INR"}).status_code == 422
    assert api.post("/accounts", json={"name": "Bank", "type": "LIABILITY", "currency": "INR"}).status_code == 201


@pytest.mark.parametrize("payload", [
    {"name": "X", "type": "EXPENSE", "currency": "INR"}, {"name": "X", "type": "ASSET", "currency": "IN"},
    {"name": "X", "type": "ASSET", "currency": "I2R"}, {"name": "  ", "type": "ASSET", "currency": "INR"}, {"type": "ASSET"},
])
def test_account_validation(api, payload):
    assert api.post("/accounts", json=payload).status_code == 422


def test_deactivate_hides_from_default_list(world):
    r = world.api.post(f"/accounts/{world.acct['wallet']}/deactivate")
    assert r.status_code == 200 and r.json()["isActive"] is False
    assert "Wallet" not in [a["name"] for a in world.api.get("/accounts").json()]
    assert "Wallet" in [a["name"] for a in world.api.get("/accounts", params={"includeInactive": True}).json()]


def test_deactivated_account_cannot_be_used(world):
    world.api.post(f"/accounts/{world.acct['wallet']}/deactivate")
    assert world.api.post("/transactions/expense", json=world.expense_payload(account="wallet")).status_code == 422


def test_balance_endpoint(world):
    r = world.api.get(f"/accounts/{world.acct['bank']}/balance")
    assert r.json()["balance"] == {"points": 5_000_000, "major": "INR 50000.00", "currency": "INR"}
    assert world.api.get(f"/accounts/{world.cat['food']}/balance").status_code == 404   # a category, not an account
    assert world.api.get("/accounts/99999/balance").status_code == 404
    assert world.api.post("/accounts/99999/deactivate").status_code == 404


# -------------------------------------------------------------- categories ---
def test_category_defaults_to_home_currency(api):
    r = api.post("/categories", json={"name": "Food", "type": "EXPENSE"})
    assert r.status_code == 201 and r.json()["currencyCode"] == "INR"


def test_category_budget_is_stored_in_points(world):
    cats = {c["name"]: c for c in world.api.get("/categories").json()}
    assert cats["Food"]["budgetLimit"]["points"] == 500_000 and cats["Transport"]["budgetLimit"] is None


def test_child_category(world):
    fuel = next(c for c in world.api.get("/categories").json() if c["name"] == "Fuel")
    assert fuel["parentId"] == world.cat["transport"]


@pytest.mark.parametrize("payload,why", [
    ({"name": "Bad", "type": "INCOME", "parent": "food"}, "income under expense parent"),
    ({"name": "Bad", "type": "EXPENSE", "parent": "fuel"}, "grandchild"),
    ({"name": "Bad", "type": "EXPENSE", "parent": "transport", "budget_limit": "10"}, "budget on child"),
    ({"name": "Bad", "type": "INCOME", "budget_limit": "10"}, "budget on income"),
    ({"name": "Bad", "type": "EXPENSE", "budget_limit": "abc"}, "bad budget"),
    ({"name": "Bad", "type": "EXPENSE", "budget_limit": "-5"}, "negative budget"),
    ({"name": "food", "type": "EXPENSE"}, "duplicate name"),
    ({"name": "Bad", "type": "ASSET"}, "wrong type"),
    ({"name": "Bad", "type": "EXPENSE", "parent": "missing"}, "missing parent"),
])
def test_category_rules(world, payload, why):
    payload = dict(payload)
    parent = payload.pop("parent", None)
    if parent == "missing":
        payload["parentId"] = 99999
    elif parent:
        payload["parentId"] = world.cat[parent]
    assert world.api.post("/categories", json=payload).status_code in (404, 422), why


def test_deactivate_parent_requires_children_first(world):
    assert world.api.post(f"/categories/{world.cat['transport']}/deactivate").status_code == 422
    assert world.api.post(f"/categories/{world.cat['fuel']}/deactivate").status_code == 200
    assert world.api.post(f"/categories/{world.cat['transport']}/deactivate").status_code == 200


def test_cannot_nest_under_inactive_parent(world):
    world.api.post(f"/categories/{world.cat['freelance']}/deactivate")
    r = world.api.post("/categories", json={"name": "Sub", "type": "INCOME", "parent_id": world.cat["freelance"]})
    assert r.status_code == 422


def test_inactive_category_cannot_be_used(world):
    world.api.post(f"/categories/{world.cat['fuel']}/deactivate")
    assert world.api.post("/transactions/expense", json=world.expense_payload(category="fuel")).status_code == 422
    assert world.api.post("/categories/99999/deactivate").status_code == 404


# ------------------------------------------------------------------ friends ---
def test_friend_lifecycle(api):
    r = api.post("/friends", json={"name": "Rahul", "email": "rahul@example.com"})
    assert r.status_code == 201 and r.json()["dueAccountId"]
    fid = r.json()["id"]
    assert api.patch(f"/friends/{fid}", json={"name": "Rahul S"}).json()["name"] == "Rahul S"
    assert api.delete(f"/friends/{fid}").status_code == 200
    assert api.get("/friends").json() == []


@pytest.mark.parametrize("payload", [
    {"name": "X", "email": "bad"}, {"name": "  ", "email": "x@example.com"}, {"email": "x@example.com"},
    {"name": "X", "email": "asha@example.com"},          # collides with the owner's email
])
def test_friend_validation(api, payload):
    assert api.post("/friends", json=payload).status_code in (409, 422)


def test_editing_a_friend_to_the_owners_email_conflicts(api):
    friend = api.post("/friends", json={"name": "A", "email": "a@example.com"}).json()
    r = api.patch(f"/friends/{friend['id']}", json={"email": "Asha@Example.com"})
    assert r.status_code == 409
    assert api.get("/friends").json()[0]["email"] == "a@example.com"


def test_duplicate_friend_email_conflicts(api):
    api.post("/friends", json={"name": "A", "email": "a@example.com"})
    assert api.post("/friends", json={"name": "B", "email": "A@example.com"}).status_code == 409


def test_friend_with_history_cannot_be_deleted(world):
    world.split()
    r = world.api.delete(f"/friends/{world.friend['rahul']}")
    assert r.status_code == 409 and len(world.api.get("/friends").json()) == 2


def test_rename_friend_renames_due_account_reflected_in_balances(world):
    world.split()
    world.api.patch(f"/friends/{world.friend['rahul']}", json={"name": "Rahul Renamed"})
    assert "Rahul Renamed" in [r["friendName"] for r in world.api.get("/friends/balances").json()]


def test_friend_operations_on_missing_ids(world):
    assert world.api.patch("/friends/99999", json={"name": "X"}).status_code == 404
    assert world.api.delete("/friends/99999").status_code == 404


def test_friend_currency_defaults_and_override(api):
    api.post("/friends", json={"name": "Sam", "email": "sam@example.com", "currency": "usd"})
    ref = api.get("/reports/reference-data").json()
    assert len(ref["friends"]) == 1
