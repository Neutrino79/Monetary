"""Tags on transactions: create/edit, filter, group, the tag endpoints, and how they survive edits."""
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


def get(world, entry_id):
    return world.api.get(f"/transactions/{entry_id}").json()


def tags_of(world):
    return {t["name"]: t["uses"] for t in world.api.get("/tags").json()}


def test_create_with_tags_normalises_and_returns_them(world):
    e = make(world, tags=["  Trip Goa ", "#Work", "work", "trip   goa"])
    assert e["tags"] == ["trip goa", "work"]                      # lowercased, '#' dropped, de-duplicated
    assert get(world, e["id"])["tags"] == ["trip goa", "work"]
    assert make(world)["tags"] == []


def test_any_type_can_carry_tags(world):
    t = make(world, "transfer", accountId=world.acct["bank"], toAccountId=world.acct["wallet"], tags=["move"])
    f = make(world, "fronted", categoryId=world.cat["food"], friendId=world.friend["rahul"], tags=["move"])
    assert t["tags"] == f["tags"] == ["move"]


@pytest.mark.parametrize("bad", [[""], ["a,b"], ["x" * 31], [f"t{i}" for i in range(11)]])
def test_invalid_tags_are_rejected_and_nothing_is_posted(world, bad):
    before = world.api.get("/transactions").json()["total"]
    r = world.api.post("/transactions", json={"type": "expense", "description": "No", "amount": "5.00",
                                              "accountId": world.acct["bank"], "categoryId": world.cat["food"],
                                              "tags": bad})
    assert r.status_code == 422 or r.status_code == 400, r.text
    assert world.api.get("/transactions").json()["total"] == before
    assert tags_of(world) == {}


def test_edit_replaces_clears_and_leaves_tags(world):
    e = make(world, tags=["a", "b"])
    r = world.api.patch(f"/transactions/{e['id']}", json={"description": "Renamed"})
    assert r.json()["tags"] == ["a", "b"]                         # untouched when not sent
    r = world.api.patch(f"/transactions/{e['id']}", json={"tags": ["b", "c"]})
    assert r.json()["tags"] == ["b", "c"] and r.json()["id"] == e["id"]
    r = world.api.patch(f"/transactions/{e['id']}", json={"tags": []})
    assert r.json()["tags"] == []
    assert tags_of(world) == {}                                    # unused tags are pruned


def test_tags_only_edit_does_not_touch_the_ledger_in_strict_mode(world):
    world.set_mode("STRICT")
    e = make(world, tags=["a"])
    r = world.api.patch(f"/transactions/{e['id']}", json={"tags": ["a", "b"]})
    assert r.json()["id"] == e["id"] and r.json()["tags"] == ["a", "b"]    # no replacement entry


def test_strict_replacement_keeps_tags(world):
    world.set_mode("STRICT")
    e = make(world, tags=["keep"])
    r = world.api.patch(f"/transactions/{e['id']}", json={"amount": "250.00"}).json()
    assert r["id"] != e["id"] and r["correctionOf"] == e["id"] and r["tags"] == ["keep"]
    assert tags_of(world) == {"keep": 1}                           # the reversed original does not count


def test_converting_to_a_split_keeps_tags(world):
    e = make(world, tags=["dinner"])
    r = world.api.patch(f"/transactions/{e['id']}", json={
        "yourShare": "40.00", "splits": [{"friendId": world.friend["rahul"], "share": "60.00"}]})
    assert r.status_code == 200, r.text
    assert r.json()["type"] == "split" and r.json()["tags"] == ["dinner"]


def test_delete_removes_the_tag_links(world):
    e = make(world, tags=["gone"])
    assert world.api.delete(f"/transactions/{e['id']}").status_code == 200
    assert tags_of(world) == {}


def test_filter_by_one_or_any_of_several_tags(world):
    make(world, description="Goa hotel", tags=["goa"])
    make(world, description="Office lunch", tags=["work"])
    make(world, description="Plain")

    def names(**params):
        return sorted(i["description"] for i in world.api.get("/transactions", params=params).json()["items"])
    assert names(tag="goa") == ["Goa hotel"]
    assert names(tag=["goa", "WORK"]) == ["Goa hotel", "Office lunch"]    # any of them; case-insensitive
    assert "Plain" in names()


def test_group_by_tag_lists_a_transaction_under_each_tag(world):
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
    # filtering to one tag while grouping shows only that tag's group
    only = world.api.get("/transactions/groups", params={**params, "tag": "b"}).json()["groups"]
    assert [g["label"] for g in only] == ["b"]
    rows = world.api.get("/transactions", params={**params, "tag": "b"}).json()
    assert rows["total"] == 1 and rows["items"][0]["description"] == "Both"


def test_tag_endpoints_list_rename_merge_and_delete(world):
    a = make(world, tags=["old"])
    b = make(world, tags=["new", "old"])
    listed = world.api.get("/tags").json()
    assert [(t["name"], t["uses"]) for t in listed] == [("old", 2), ("new", 1)]
    old_id = listed[0]["id"]
    r = world.api.patch(f"/tags/{old_id}", json={"name": "  Renamed "})
    assert r.json()["name"] == "renamed" and get(world, a["id"])["tags"] == ["renamed"]
    new_id = next(t["id"] for t in world.api.get("/tags").json() if t["name"] == "new")
    merged = world.api.patch(f"/tags/{new_id}", json={"name": "renamed"}).json()       # onto an existing tag
    assert merged["uses"] == 2 and get(world, b["id"])["tags"] == ["renamed"]
    assert world.api.delete(f"/tags/{merged['id']}").status_code == 200
    assert get(world, a["id"])["tags"] == [] and tags_of(world) == {}
    assert world.api.delete(f"/tags/{merged['id']}").status_code == 404
    assert world.api.patch("/tags/999", json={"name": "x"}).status_code == 404
    assert world.api.patch(f"/tags/{old_id}", json={"name": ","}).status_code in (400, 404, 422)
