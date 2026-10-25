"""Managed tags: created on their own, picked on transactions, filtered and grouped, and kept through edits."""
from __future__ import annotations

import pytest


def make(world, type_="expense", **kw):
    body = {"type": type_, "description": "Test", "amount": "100.00", "date": "2026-03-10"}
    if type_ == "expense":
        body.update(accountId=world.acct["bank"], categoryId=world.cat["food"])
    body.update(kw)
    r = world.api.post("/transactions", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def tag(world, *names):
    ids = {}
    for n in names:
        r = world.api.post("/tags", json={"name": n})
        assert r.status_code == 201, r.text
        ids[r.json()["name"]] = r.json()["id"]
    return ids


def get(world, entry_id):
    return world.api.get(f"/transactions/{entry_id}").json()


def uses(world):
    return {t["name"]: t["uses"] for t in world.api.get("/tags").json()}


# ------------------------------------------------------------------ the tag list itself
def test_create_normalises_and_lists_alphabetically_including_unused(world):
    r = world.api.post("/tags", json={"name": "  #Trip   Goa "})
    assert r.status_code == 201 and r.json()["name"] == "trip goa" and r.json()["uses"] == 0
    tag(world, "alpha")
    assert [t["name"] for t in world.api.get("/tags").json()] == ["alpha", "trip goa"]      # unused tags stay


def test_duplicate_and_invalid_names_are_rejected(world):
    tag(world, "work")
    assert world.api.post("/tags", json={"name": "WORK"}).status_code == 409
    for bad in ("", "   ", "a,b", "x" * 31):
        assert world.api.post("/tags", json={"name": bad}).status_code in (400, 422), bad


def test_rename_merge_and_delete(world):
    ids = tag(world, "old", "new")
    a = make(world, tags=["old"])
    b = make(world, tags=["new", "old"])
    assert uses(world) == {"new": 1, "old": 2}
    r = world.api.patch(f"/tags/{ids['old']}", json={"name": "  Renamed "})
    assert r.json()["name"] == "renamed" and get(world, a["id"])["tags"] == ["renamed"]
    merged = world.api.patch(f"/tags/{ids['new']}", json={"name": "renamed"}).json()     # onto an existing tag
    assert merged["uses"] == 2 and get(world, b["id"])["tags"] == ["renamed"]
    assert [t["name"] for t in world.api.get("/tags").json()] == ["renamed"]
    assert world.api.delete(f"/tags/{merged['id']}").status_code == 200
    assert get(world, a["id"])["tags"] == [] and world.api.get("/tags").json() == []
    assert world.api.delete(f"/tags/{merged['id']}").status_code == 404
    assert world.api.patch("/tags/999", json={"name": "x"}).status_code == 404
    assert world.api.patch(f"/tags/{ids['new']}", json={"name": ","}).status_code in (400, 404, 422)


# ----------------------------------------------------------------- on transactions
def test_create_with_tags_normalises_dedupes_and_returns_them(world):
    tag(world, "trip goa", "work")
    e = make(world, tags=["  Trip Goa ", "#Work", "work", "trip   goa"])
    assert e["tags"] == ["trip goa", "work"]
    assert get(world, e["id"])["tags"] == ["trip goa", "work"]
    assert make(world)["tags"] == []


def test_a_tag_that_does_not_exist_is_rejected_and_nothing_is_posted(world):
    tag(world, "real")
    before = world.api.get("/transactions").json()["total"]
    r = world.api.post("/transactions", json={"type": "expense", "description": "No", "amount": "5.00",
                                              "accountId": world.acct["bank"], "categoryId": world.cat["food"],
                                              "tags": ["real", "typo"]})
    assert r.status_code in (400, 422) and "typo" in r.text and "Create tags first" in r.text
    assert world.api.get("/transactions").json()["total"] == before
    e = make(world, tags=["real"])
    r = world.api.patch(f"/transactions/{e['id']}", json={"tags": ["nope"]})
    assert r.status_code in (400, 422) and get(world, e["id"])["tags"] == ["real"]


@pytest.mark.parametrize("bad", [[""], ["a,b"], ["x" * 31], [f"t{i}" for i in range(11)]])
def test_invalid_tags_are_rejected(world, bad):
    r = world.api.post("/transactions", json={"type": "expense", "description": "No", "amount": "5.00",
                                              "accountId": world.acct["bank"], "categoryId": world.cat["food"],
                                              "tags": bad})
    assert r.status_code in (400, 422), r.text


def test_any_type_can_carry_tags(world):
    tag(world, "move")
    t = make(world, "transfer", accountId=world.acct["bank"], toAccountId=world.acct["wallet"], tags=["move"])
    f = make(world, "fronted", categoryId=world.cat["food"], friendId=world.friend["rahul"], tags=["move"])
    assert t["tags"] == f["tags"] == ["move"]


def test_edit_replaces_clears_and_leaves_tags(world):
    tag(world, "a", "b", "c")
    e = make(world, tags=["a", "b"])
    r = world.api.patch(f"/transactions/{e['id']}", json={"description": "Renamed"})
    assert r.json()["tags"] == ["a", "b"]                         # untouched when not sent
    r = world.api.patch(f"/transactions/{e['id']}", json={"tags": ["b", "c"]})
    assert r.json()["tags"] == ["b", "c"] and r.json()["id"] == e["id"]
    r = world.api.patch(f"/transactions/{e['id']}", json={"tags": []})
    assert r.json()["tags"] == [] and set(uses(world)) == {"a", "b", "c"}     # the tags themselves remain


def test_tags_only_edit_does_not_touch_the_ledger_in_strict_mode(world):
    tag(world, "a", "b")
    world.set_mode("STRICT")
    e = make(world, tags=["a"])
    r = world.api.patch(f"/transactions/{e['id']}", json={"tags": ["a", "b"]})
    assert r.json()["id"] == e["id"] and r.json()["tags"] == ["a", "b"]    # no replacement entry


def test_strict_replacement_keeps_tags(world):
    tag(world, "keep")
    world.set_mode("STRICT")
    e = make(world, tags=["keep"])
    r = world.api.patch(f"/transactions/{e['id']}", json={"amount": "250.00"}).json()
    assert r["id"] != e["id"] and r["correctionOf"] == e["id"] and r["tags"] == ["keep"]
    assert uses(world) == {"keep": 1}                              # the reversed original does not count


def test_converting_to_a_split_keeps_tags(world):
    tag(world, "dinner")
    e = make(world, tags=["dinner"])
    r = world.api.patch(f"/transactions/{e['id']}", json={
        "yourShare": "40.00", "splits": [{"friendId": world.friend["rahul"], "share": "60.00"}]})
    assert r.status_code == 200, r.text
    assert r.json()["type"] == "split" and r.json()["tags"] == ["dinner"]


def test_deleting_a_transaction_frees_the_tag_but_keeps_it(world):
    tag(world, "gone")
    e = make(world, tags=["gone"])
    assert uses(world) == {"gone": 1}
    assert world.api.delete(f"/transactions/{e['id']}").status_code == 200
    assert uses(world) == {"gone": 0}


# --------------------------------------------------------------- filter and group
def test_filter_by_one_or_any_of_several_tags(world):
    tag(world, "goa", "work")
    make(world, description="Goa hotel", tags=["goa"])
    make(world, description="Office lunch", tags=["work"])
    make(world, description="Plain")

    def names(**params):
        return sorted(i["description"] for i in world.api.get("/transactions", params=params).json()["items"])
    assert names(tag="goa") == ["Goa hotel"]
    assert names(tag=["goa", "WORK"]) == ["Goa hotel", "Office lunch"]    # any of them; case-insensitive
    assert "Plain" in names()


def test_group_by_tag_lists_a_transaction_under_each_tag(world):
    tag(world, "a", "b")
    make(world, description="Both", amount="100.00", tags=["a", "b"])
    make(world, description="Only a", amount="50.00", tags=["a"])
    make(world, description="None", amount="10.00")
    params = {"groupBy": "tag", "dateFrom": "2026-03-01", "dateTo": "2026-03-31"}
    items = world.api.get("/transactions", params=params).json()["items"]
    assert len(items) == 4                                         # Both twice, Only a, None
    groups = world.api.get("/transactions/groups", params=params).json()["groups"]
    by_label = {g["label"]: g for g in groups}
    assert [g["label"] for g in groups] == ["a", "b", "Untagged"]  # alphabetical, Untagged last
    assert by_label["a"]["count"] == 2 and by_label["a"]["totals"][0]["moneyOut"]["points"] == 15_000
    assert by_label["b"]["count"] == 1 and by_label["Untagged"]["count"] == 1
    only = world.api.get("/transactions/groups", params={**params, "tag": "b"}).json()["groups"]
    assert [g["label"] for g in only] == ["b"]
    rows = world.api.get("/transactions", params={**params, "tag": "b"}).json()
    assert rows["total"] == 1 and rows["items"][0]["description"] == "Both"
