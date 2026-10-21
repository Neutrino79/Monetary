"""Shared sample data used by EVERY test layer (pytest suites and the live
smoke script), so all of them describe the same small, realistic world.

The world
---------
Owner "Asha Patil" (INR, Asia/Kolkata) with:
  accounts   bank (ASSET), wallet (ASSET), card (LIABILITY), usd (ASSET, USD)
  categories food (EXPENSE, budget 5000.00), transport (EXPENSE) with child
             fuel, travel_usd (EXPENSE, USD), salary (INCOME), freelance (INCOME)
  friends    rahul, priya (both INR)
  ledger     one opening salary of OPENING_BALANCE credited to the bank

Change the data here and every layer follows. Amounts are strings in major
units (what the API takes); *_POINTS constants are the same values in minor
units (what balances report).
"""
from __future__ import annotations

from types import SimpleNamespace

API = "/api/v0.5"

OWNER = {
    "name": "Asha Patil",
    "email": "asha@example.com",
    "currency": "INR",
    "timezone": "Asia/Kolkata",
    "password": "correct-horse-1",
    "security_question_id": 1,
    "security_answer": "Whiskers",
    "seed_defaults": False,   # tests build their own categories; default seeding is tested separately
}

ACCOUNTS = {
    "bank": {"name": "Bank", "type": "ASSET", "currency": "INR"},
    "wallet": {"name": "Wallet", "type": "ASSET", "currency": "INR"},
    "card": {"name": "Credit Card", "type": "LIABILITY", "currency": "INR"},
    "usd": {"name": "USD Account", "type": "ASSET", "currency": "USD"},
}

# "parent" refers to another key in this dict (resolved at seed time).
CATEGORIES = {
    "food": {"name": "Food", "type": "EXPENSE", "budget_limit": "5000.00", "currency": "INR"},
    "transport": {"name": "Transport", "type": "EXPENSE", "currency": "INR"},
    "fuel": {"name": "Fuel", "type": "EXPENSE", "currency": "INR", "parent": "transport"},
    "travel_usd": {"name": "Travel (USD)", "type": "EXPENSE", "currency": "USD"},
    "salary": {"name": "Salary", "type": "INCOME", "currency": "INR"},
    "freelance": {"name": "Freelance", "type": "INCOME", "currency": "INR"},
}

FRIENDS = {
    "rahul": {"name": "Rahul Sharma", "email": "rahul@example.com"},
    "priya": {"name": "Priya Nair", "email": "priya@example.com"},
}

OPENING_BALANCE = "50000.00"
OPENING_BALANCE_POINTS = 5_000_000

# Reusable amounts
DINNER = "500.00"
DINNER_POINTS = 50_000


def seed(client, headers=None, *, fund=True) -> SimpleNamespace:
    """Create the sample world through the public API.

    `client` is anything with .post(url, json=, headers=) returning a response
    with .status_code/.json() -- FastAPI's TestClient or an httpx.Client.
    Returns SimpleNamespace(acct={key: id}, cat={key: id}, friend={key: id}).
    """
    headers = headers or {}

    def post(path, payload):
        r = client.post(API + path, json=payload, headers=headers)
        assert r.status_code == 201, f"seeding {path} failed: {r.status_code} {r.text}"
        return r.json()

    acct = {k: post("/accounts", v)["id"] for k, v in ACCOUNTS.items()}
    cat: dict[str, int] = {}
    for key, spec in CATEGORIES.items():
        payload = {k: v for k, v in spec.items() if k != "parent"}
        if "parent" in spec:
            payload["parentId"] = cat[spec["parent"]]
        cat[key] = post("/categories", payload)["id"]
    friend = {k: post("/friends", v)["id"] for k, v in FRIENDS.items()}
    if fund:
        post("/transactions/income", {
            "account_id": acct["bank"], "category_id": cat["salary"],
            "amount": OPENING_BALANCE, "title": "Opening salary",
        })
    return SimpleNamespace(acct=acct, cat=cat, friend=friend)
