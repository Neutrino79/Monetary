"""Contract tests for the pieces the web app depends on: public meta/setup
status, configurable branding, default seeding, richer accounts/categories/
friends, opening balances and partial-update (clear vs. unchanged) semantics."""
from __future__ import annotations

import json

import pytest

from tests.sample_data import API, OWNER


# --------------------------------------------------------------------------- #
# branding + setup status
# --------------------------------------------------------------------------- #
def test_meta_is_public_and_defaults_to_monetary(anon, monkeypatch):
    monkeypatch.delenv("MONETARY_APP_NAME", raising=False)
    body = anon.get("/meta").json()
    assert body["appName"] == "Monetary" and body["version"] and body["apiVersion"] == "v0.5"
    assert body["tagline"]


def test_app_name_is_configurable_without_code_changes(anon, monkeypatch):
    monkeypatch.setenv("MONETARY_APP_NAME", "Ledgerly")
    monkeypatch.setenv("MONETARY_APP_TAGLINE", "Money, but tidy")
    body = anon.get("/meta").json()
    assert body["appName"] == "Ledgerly" and body["tagline"] == "Money, but tidy"
    assert anon.client.get("/").json()["name"] == "Ledgerly API"


def test_blank_app_name_falls_back_to_default(anon, monkeypatch):
    monkeypatch.setenv("MONETARY_APP_NAME", "   ")
    assert anon.get("/meta").json()["appName"] == "Monetary"


def test_setup_status_flips_after_init_and_init_is_rejected_twice(anon):
    assert anon.get("/setup/status").json() == {"initialized": False}
    assert anon.post("/setup/init", json=OWNER).status_code == 201
    assert anon.get("/setup/status").json() == {"initialized": True}
    again = anon.post("/setup/init", json={**OWNER, "email": "other@example.com"})
    assert again.status_code == 409 and again.json()["error_type"] == "ConflictError"


def test_owner_out_has_the_fields_the_app_needs(api):
    o = api.get("/owner").json()
    assert o["isSuperuser"] is True and o["securityQuestionId"] == OWNER["security_question_id"]
    assert o["createdAt"] and o["updatedAt"] and o["homeCurrencyCode"] == "INR"


# --------------------------------------------------------------------------- #
# seeding defaults
# --------------------------------------------------------------------------- #
def _init_seeded(anon, **extra):
    payload = {k: v for k, v in OWNER.items() if k != "seed_defaults"}
    r = anon.post("/setup/init", json={**payload, **extra})
    assert r.status_code == 201, r.text
    anon.token = r.json()["accessToken"]
    return anon


def test_default_seeding_creates_categories_and_income_sources(anon):
    _init_seeded(anon)
    cats = anon.get("/categories").json()
    names = {c["name"]: c for c in cats}
    assert {"Food & Dining", "Groceries", "Salary", "Freelance"} <= set(names)
    assert names["Groceries"]["parentId"] == names["Food & Dining"]["id"]
    assert names["Salary"]["accountType"] == "INCOME" and names["Salary"]["color"].startswith("#")
    income = anon.get("/categories", params={"type": "INCOME"}).json()
    assert income and all(c["accountType"] == "INCOME" for c in income)
    assert all(c["currencyCode"] == "INR" for c in cats)


def test_seeding_can_be_disabled(anon):
    _init_seeded(anon, seed_defaults=False)
    assert anon.get("/categories").json() == []


def test_seed_defaults_are_configurable_via_file(anon, tmp_path, monkeypatch):
    f = tmp_path / "seed.json"
    f.write_text(json.dumps({"expense": [{"name": "Pets", "children": [{"name": "Vet"}]}],
                             "income": [{"name": "Pocket money"}]}))
    monkeypatch.setenv("MONETARY_SEED_DEFAULTS_PATH", str(f))
    _init_seeded(anon)
    assert {c["name"] for c in anon.get("/categories").json()} == {"Pets", "Vet", "Pocket money"}


def test_bad_seed_file_aborts_setup_atomically(anon, tmp_path, monkeypatch):
    f = tmp_path / "seed.json"
    f.write_text("{not json")
    monkeypatch.setenv("MONETARY_SEED_DEFAULTS_PATH", str(f))
    payload = {k: v for k, v in OWNER.items() if k != "seed_defaults"}
    assert anon.post("/setup/init", json=payload).status_code == 422
    assert anon.get("/setup/status").json() == {"initialized": False}    # nothing half-created


# --------------------------------------------------------------------------- #
# accounts
# --------------------------------------------------------------------------- #
def test_account_details_and_defaults(api):
    bank = api.post("/accounts", json={"name": "HDFC", "type": "ASSET", "currency": "INR"}).json()
    assert bank["subtype"] == "bank" and bank["creditLimit"] is None and bank["balance"]["points"] == 0
    card = api.post("/accounts", json={"name": "Visa", "type": "LIABILITY", "currency": "INR",
                                       "creditLimit": "50000.00", "statementDay": 5}).json()
    assert card["subtype"] == "credit_card" and card["creditLimit"]["points"] == 5_000_000
    assert card["statementDay"] == 5


@pytest.mark.parametrize("extra", [
    {"type": "ASSET", "creditLimit": "100.00"},        # credit limit is liability-only
    {"type": "ASSET", "statementDay": 5},               # statement day is liability-only
    {"type": "ASSET", "subtype": "credit_card"},        # subtype must match the account type
    {"type": "LIABILITY", "subtype": "bank"},
    {"type": "LIABILITY", "creditLimit": "0"},
    {"type": "ASSET", "openingBalance": "-5.00"},
])
def test_account_detail_rejections(api, extra):
    r = api.post("/accounts", json={"name": "X", "currency": "INR", **extra})
    assert r.status_code == 422, r.text


def test_opening_balance_posts_an_adjustment_and_moves_the_balance(api):
    a = api.post("/accounts", json={"name": "Cash", "type": "ASSET", "currency": "INR",
                                    "subtype": "cash", "openingBalance": "1500.50"}).json()
    assert a["balance"]["points"] == 150_050 and a["subtype"] == "cash"
    card = api.post("/accounts", json={"name": "Card", "type": "LIABILITY", "currency": "INR",
                                       "openingBalance": "300.00"}).json()
    assert card["balance"]["points"] == 30_000        # amount owed, shown positive


def test_account_patch_partial_update_and_clear(api):
    card = api.post("/accounts", json={"name": "Visa", "type": "LIABILITY", "currency": "INR",
                                       "creditLimit": "1000.00", "statementDay": 9}).json()
    r = api.patch(f"/accounts/{card['id']}", json={"name": "Visa Platinum"}).json()
    assert r["name"] == "Visa Platinum" and r["creditLimit"]["points"] == 100_000 and r["statementDay"] == 9
    r = api.patch(f"/accounts/{card['id']}", json={"creditLimit": None, "statementDay": None}).json()
    assert r["creditLimit"] is None and r["statementDay"] is None
    asset = api.post("/accounts", json={"name": "B", "type": "ASSET", "currency": "INR"}).json()
    assert api.patch(f"/accounts/{asset['id']}", json={"creditLimit": "5.00"}).status_code == 422
    assert api.patch(f"/accounts/{asset['id']}", json={"name": "  "}).status_code == 422
    other = api.post("/accounts", json={"name": "Wallet", "type": "ASSET", "currency": "INR"}).json()
    assert api.patch(f"/accounts/{other['id']}", json={"name": "b"}).status_code == 422   # duplicate (case-insensitive)
    assert api.patch("/accounts/9999", json={"name": "Z"}).status_code == 404


def test_account_deactivate_and_reactivate(api):
    a = api.post("/accounts", json={"name": "Old", "type": "ASSET", "currency": "INR"}).json()
    assert api.post(f"/accounts/{a['id']}/deactivate").json()["isActive"] is False
    assert [x["id"] for x in api.get("/accounts").json()] == []
    assert api.post(f"/accounts/{a['id']}/reactivate").json()["isActive"] is True
    assert [x["id"] for x in api.get("/accounts").json()] == [a["id"]]


# --------------------------------------------------------------------------- #
# categories
# --------------------------------------------------------------------------- #
def _cat(api, **kw):
    r = api.post("/categories", json={"type": "EXPENSE", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def test_category_color_and_patch_semantics(api):
    c = _cat(api, name="Food", color="#AABBCC", budgetLimit="500.00")
    assert c["color"] == "#aabbcc" and c["budgetLimit"]["points"] == 50_000
    r = api.patch(f"/categories/{c['id']}", json={"name": "Dining"}).json()
    assert r["name"] == "Dining" and r["color"] == "#aabbcc" and r["budgetLimit"]["points"] == 50_000
    r = api.patch(f"/categories/{c['id']}", json={"color": None, "budgetLimit": None}).json()
    assert r["color"] is None and r["budgetLimit"] is None
    assert api.patch(f"/categories/{c['id']}", json={"color": "red"}).status_code == 422


def test_category_reparenting_rules(api):
    a, b = _cat(api, name="A"), _cat(api, name="B")
    child = _cat(api, name="A1", parentId=a["id"])
    assert api.patch(f"/categories/{b['id']}", json={"parentId": a["id"]}).json()["parentId"] == a["id"]
    assert api.patch(f"/categories/{a['id']}", json={"parentId": b["id"]}).status_code == 422   # has children
    assert api.patch(f"/categories/{child['id']}", json={"parentId": b["id"]}).status_code == 422  # b is now a child
    assert api.patch(f"/categories/{child['id']}", json={"parentId": child["id"]}).status_code == 422
    assert api.patch(f"/categories/{child['id']}", json={"parentId": None}).json()["parentId"] is None
    inc = api.post("/categories", json={"name": "Pay", "type": "INCOME"}).json()
    assert api.patch(f"/categories/{inc['id']}", json={"parentId": a["id"]}).status_code == 422  # type mismatch


def test_budget_only_on_root_expense_categories_when_patching(api):
    a = _cat(api, name="A")
    child = _cat(api, name="A1", parentId=a["id"])
    inc = api.post("/categories", json={"name": "Pay", "type": "INCOME"}).json()
    assert api.patch(f"/categories/{child['id']}", json={"budgetLimit": "10.00"}).status_code == 422
    assert api.patch(f"/categories/{inc['id']}", json={"budgetLimit": "10.00"}).status_code == 422
    assert api.patch(f"/categories/{a['id']}", json={"budgetLimit": "10.00"}).status_code == 200


def test_category_archive_and_restore_respects_hierarchy(api):
    a = _cat(api, name="A")
    child = _cat(api, name="A1", parentId=a["id"])
    assert api.post(f"/categories/{a['id']}/deactivate").status_code == 422     # child still active
    assert api.post(f"/categories/{child['id']}/deactivate").status_code == 200
    assert api.post(f"/categories/{a['id']}/deactivate").status_code == 200
    assert api.post(f"/categories/{child['id']}/reactivate").status_code == 422  # parent archived
    assert api.post(f"/categories/{a['id']}/reactivate").json()["isActive"] is True
    assert api.post(f"/categories/{child['id']}/reactivate").json()["isActive"] is True


# --------------------------------------------------------------------------- #
# friends
# --------------------------------------------------------------------------- #
def test_friend_phone_and_partial_update(api):
    f = api.post("/friends", json={"name": "Rahul", "email": "rahul@example.com", "phone": " +91 99999 00000 "}).json()
    assert f["phone"] == "+91 99999 00000" and f["createdAt"]
    r = api.patch(f"/friends/{f['id']}", json={"email": "r2@example.com"}).json()
    assert r["email"] == "r2@example.com" and r["phone"] == "+91 99999 00000" and r["name"] == "Rahul"
    assert api.patch(f"/friends/{f['id']}", json={"phone": None}).json()["phone"] is None
    other = api.post("/friends", json={"name": "Priya", "email": "priya@example.com"}).json()
    assert api.patch(f"/friends/{other['id']}", json={"email": "r2@example.com"}).status_code == 409
    assert api.patch(f"/friends/{other['id']}", json={"email": "not-an-email"}).status_code == 422
    assert api.patch(f"/friends/{other['id']}", json={"name": "  "}).status_code == 422


def test_renaming_a_friend_renames_their_due_account(world):
    fid = world.friend["rahul"]
    assert world.api.patch(f"/friends/{fid}", json={"name": "Rahul K"}).status_code == 200
    assert {f["id"]: f["name"] for f in world.api.get("/friends").json()}[fid] == "Rahul K"
