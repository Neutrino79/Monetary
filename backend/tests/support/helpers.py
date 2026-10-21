"""Test helpers: a thin authenticated API wrapper, a `World` with convenience
methods over the shared sample data, and the ledger-invariant checker that
runs after every API test."""
from __future__ import annotations

import os
import sqlite3

from tests.support.sample_data import API


class Api:
    """Authenticated wrapper around a TestClient; paths are relative to /api/v0.5."""

    def __init__(self, client, token: str | None = None):
        self.client = client
        self.token = token

    def request(self, method, path, **kw):
        headers = dict(kw.pop("headers", {}) or {})
        if self.token and "Authorization" not in headers:
            headers["Authorization"] = f"Bearer {self.token}"
        return self.client.request(method, API + path, headers=headers, **kw)

    def get(self, path, **kw): return self.request("GET", path, **kw)
    def post(self, path, **kw): return self.request("POST", path, **kw)
    def patch(self, path, **kw): return self.request("PATCH", path, **kw)
    def delete(self, path, **kw): return self.request("DELETE", path, **kw)


class World:
    """The seeded sample world plus shortcuts. `ok_*` helpers assert success."""

    def __init__(self, api: Api, ids):
        self.api, self.acct, self.cat, self.friend = api, ids.acct, ids.cat, ids.friend

    # --- reads -----------------------------------------------------------
    def balance(self, account: str) -> int:
        r = self.api.get(f"/accounts/{self.acct[account]}/balance")
        assert r.status_code == 200, r.text
        return r.json()["balance"]["points"]

    def friend_balance(self, friend: str) -> int:
        rows = self.api.get("/friends/balances").json()
        return next(r for r in rows if r["friendId"] == self.friend[friend])["balance"]["points"]

    def entry(self, entry_id: int) -> dict:
        r = self.api.get(f"/transactions/{entry_id}/postings")   # raw double-entry view
        assert r.status_code == 200, r.text
        return r.json()

    def set_mode(self, mode: str):
        r = self.api.patch("/owner", json={"ledger_mode": mode})
        assert r.status_code == 200, r.text

    # --- payload builders (for negative tests) ----------------------------
    def expense_payload(self, account="bank", category="food", amount="100.00", title="Test expense", **extra):
        return {"account_id": self.acct[account], "category_id": self.cat[category],
                "amount": amount, "title": title, **extra}

    def split_payload(self, owner_share="150.00", shares=(("rahul", "350.00"),), account="bank",
                      category="food", title="Group dinner", **extra):
        return {"account_id": self.acct[account], "category_id": self.cat[category],
                "owner_share": owner_share, "title": title,
                "friend_shares": [{"friend_id": self.friend[f], "amount": a} for f, a in shares], **extra}

    # --- success-path actions -------------------------------------------------
    def expense(self, *a, **kw) -> dict:
        r = self.api.post("/transactions/expense", json=self.expense_payload(*a, **kw))
        assert r.status_code == 201, r.text
        return r.json()

    def income(self, account="bank", category="salary", amount="1000.00", title="Test income", **extra) -> dict:
        r = self.api.post("/transactions/income", json={
            "account_id": self.acct[account], "category_id": self.cat[category],
            "amount": amount, "title": title, **extra})
        assert r.status_code == 201, r.text
        return r.json()

    def split(self, *a, **kw) -> dict:
        r = self.api.post("/splits", json=self.split_payload(*a, **kw))
        assert r.status_code == 201, r.text
        return r.json()

    def fronted(self, friend="rahul", amount="50.00", category="food", title="Tea", **extra) -> dict:
        r = self.api.post("/splits/fronted", json={
            "category_id": self.cat[category], "friend_id": self.friend[friend],
            "amount": amount, "title": title, **extra})
        assert r.status_code == 201, r.text
        return r.json()

    def settle(self, friend="rahul", account="bank", amount="100.00", **extra) -> dict:
        r = self.api.post("/settlements", json={
            "friend_id": self.friend[friend], "account_id": self.acct[account], "amount": amount, **extra})
        assert r.status_code == 201, r.text
        return r.json()

    def transfer(self, src="bank", dst="wallet", amount="100.00", **extra) -> dict:
        r = self.api.post("/transfers", json={
            "from_account_id": self.acct[src], "to_account_id": self.acct[dst], "amount": amount, **extra})
        assert r.status_code == 201, r.text
        return r.json()


def assert_ledger_invariants(db_path) -> None:
    """The properties that must hold for the database after ANY sequence of
    operations. Run automatically at the end of every API test."""
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        # 1. every entry: >= 2 postings, SUM(debit) == SUM(credit)
        for r in conn.execute("SELECT journal_entry_id AS e, SUM(debit_amount) AS d, "
                              "SUM(credit_amount) AS c, COUNT(*) AS n FROM posting GROUP BY journal_entry_id"):
            assert r["n"] >= 2, f"entry {r['e']} has only {r['n']} posting(s)"
            assert r["d"] == r["c"], f"entry {r['e']} unbalanced: debit={r['d']} credit={r['c']}"
        # 2. every entry has postings; no orphan postings
        n = conn.execute("SELECT COUNT(*) FROM journal_entry WHERE id NOT IN "
                         "(SELECT journal_entry_id FROM posting)").fetchone()[0]
        assert n == 0, f"{n} journal entries have no postings"
        n = conn.execute("SELECT COUNT(*) FROM posting WHERE journal_entry_id NOT IN "
                         "(SELECT id FROM journal_entry)").fetchone()[0]
        assert n == 0, f"{n} orphan postings"
        # 3. trial balance
        d, c = conn.execute("SELECT COALESCE(SUM(debit_amount),0), COALESCE(SUM(credit_amount),0) FROM posting").fetchone()
        assert d == c, f"trial balance off: debit={d} credit={c}"
        # 4. reversal links are consistent both ways
        for r in conn.execute("SELECT id, reversed_by_id FROM journal_entry WHERE status = 'REVERSED'"):
            rev = conn.execute("SELECT entry_type, reversal_of_id FROM journal_entry WHERE id = ?",
                               (r["reversed_by_id"],)).fetchone()
            assert rev and rev["entry_type"] == "REVERSAL" and rev["reversal_of_id"] == r["id"], \
                f"entry {r['id']} REVERSED but reversal link is inconsistent"
        # 5. posting currency matches its account's currency (equity has none)
        n = conn.execute("SELECT COUNT(*) FROM posting p JOIN journal_entry j ON j.id = p.journal_entry_id "
                         "JOIN account a ON a.id = p.account_id "
                         "WHERE a.currency_code IS NOT NULL AND a.currency_code != j.currency_code").fetchone()[0]
        assert n == 0, f"{n} postings whose account currency differs from the entry currency"
    finally:
        conn.close()
