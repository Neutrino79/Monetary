"""End-to-end smoke test for the Duevia API, run against a throwaway SQLite DB.
Exercises: setup, login, accounts, categories, friends, expense, income,
refund, transfer, split, fronted, settlement, reports, rate limiting, and the
error contract. Exits non-zero on first failure.
"""
from __future__ import annotations

import os
import sys
import tempfile

DB_FD, DB_PATH = tempfile.mkstemp(suffix=".db")
os.close(DB_FD)
os.remove(DB_PATH)
os.environ["DUEVIA_DB_PATH"] = DB_PATH
os.environ["DUEVIA_ENV"] = "development"

sys.path.insert(0, os.getcwd())

from fastapi.testclient import TestClient  # noqa: E402
from duevia.presentation.api.app import app  # noqa: E402

client = TestClient(app)
FAILURES = []


def check(label, cond, extra=""):
    status = "OK" if cond else "FAIL"
    print(f"[{status}] {label} {extra}")
    if not cond:
        FAILURES.append(label)


# ---------------------------------------------------------------- health ---
r = client.get("/health")
check("GET /health", r.status_code == 200 and r.json()["database"] == "ok", r.text)

# ------------------------------------------------------------------ setup --
init_payload = {
    "name": "Test Owner", "email": "owner@example.com", "currency": "INR",
    "timezone": "Asia/Kolkata", "password": "supersecret1",
    "security_question_id": 1, "security_answer": "Fluffy",
}
r = client.post("/api/v0.5/setup/init", json=init_payload)
check("POST /setup/init", r.status_code == 201, r.text)
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# double-init should conflict
r2 = client.post("/api/v0.5/setup/init", json=init_payload)
check("double /setup/init -> 409", r2.status_code == 409, r2.text)

# ------------------------------------------------------------------- auth --
r = client.post("/api/v0.5/auth/login", data={"username": "owner@example.com", "password": "supersecret1"})
check("POST /auth/login", r.status_code == 200, r.text)

r = client.post("/api/v0.5/auth/login", data={"username": "owner@example.com", "password": "WRONG"})
check("bad login -> 422 ValidationError", r.status_code == 422 and r.json()["error_type"] == "ValidationError", r.text)

r = client.get("/api/v0.5/owner", headers={"Authorization": "Bearer garbage"})
check("bad token -> 401", r.status_code == 401, r.text)

r = client.get("/api/v0.5/owner")
check("no token -> 401", r.status_code == 401, r.text)

# rate limit: hammer login with bad creds past the threshold
last_status = None
for _ in range(15):
    resp = client.post("/api/v0.5/auth/login", data={"username": "owner@example.com", "password": "WRONG"})
    last_status = resp.status_code
check("login rate limiter eventually triggers 429", last_status == 429, f"last_status={last_status}")

# ---------------------------------------------------------------- owner ---
r = client.get("/api/v0.5/owner", headers=headers)
check("GET /owner", r.status_code == 200 and r.json()["email"] == "owner@example.com", r.text)

# ------------------------------------------------------------- accounts ---
r = client.post("/api/v0.5/accounts", headers=headers, json={"name": "Bank", "type": "ASSET", "currency": "INR"})
check("create ASSET account", r.status_code == 201, r.text)
bank_id = r.json()["id"]

r = client.post("/api/v0.5/accounts", headers=headers, json={"name": "Credit Card", "type": "LIABILITY", "currency": "INR"})
check("create LIABILITY account", r.status_code == 201, r.text)
cc_id = r.json()["id"]

r = client.post("/api/v0.5/categories", headers=headers, json={"name": "Food", "type": "EXPENSE", "budget_limit": "5000.00", "currency": "INR"})
check("create EXPENSE category with budget", r.status_code == 201, r.text)
food_id = r.json()["id"]

# regression check: nesting an INCOME category under an EXPENSE parent must fail
r = client.post("/api/v0.5/categories", headers=headers, json={"name": "Bad Nest", "type": "INCOME", "parent_id": food_id, "currency": "INR"})
check("mismatched parent/child category type -> 422", r.status_code == 422, r.text)

r = client.post("/api/v0.5/categories", headers=headers, json={"name": "Salary", "type": "INCOME", "currency": "INR"})
check("create INCOME category", r.status_code == 201, r.text)
salary_id = r.json()["id"]

# ------------------------------------------------------------- friends ---
r = client.post("/api/v0.5/friends", headers=headers, json={"name": "Rahul", "email": "rahul@example.com"})
check("create friend", r.status_code == 201 and r.json()["due_account_id"] is not None, r.text)
rahul_id = r.json()["id"]

r = client.get("/api/v0.5/friends", headers=headers)
check("list friends", r.status_code == 200 and len(r.json()) == 1, r.text)

# --------------------------------------------------------- transactions --
r = client.post("/api/v0.5/transactions/expense", headers=headers,
                json={"account_id": bank_id, "category_id": food_id, "amount": "500.00", "title": "Dinner"})
check("record expense", r.status_code == 201, r.text)
expense_id = r.json()["id"]

r = client.post("/api/v0.5/transactions/income", headers=headers,
                json={"account_id": bank_id, "category_id": salary_id, "amount": "50000.00", "title": "Salary"})
check("record income", r.status_code == 201, r.text)

r = client.get(f"/api/v0.5/accounts/{bank_id}/balance", headers=headers)
check("bank balance reflects expense+income", r.status_code == 200 and r.json()["balance"]["major"] == "INR 49500.00", r.text)

r = client.post("/api/v0.5/transactions/refund", headers=headers,
                json={"for_entry_id": expense_id, "amount": "200.00", "title": "Partial refund"})
check("record refund", r.status_code == 201, r.text)

r = client.post("/api/v0.5/transactions/refund", headers=headers,
                json={"for_entry_id": expense_id, "amount": "1000.00", "title": "Over-refund"})
check("over-refund -> 409 ConflictError", r.status_code == 409, r.text)

r = client.post("/api/v0.5/transactions/adjustment", headers=headers,
                json={"account_id": bank_id, "amount": "10.00", "side": "DEBIT", "title": "Correction"})
check("record adjustment", r.status_code == 201, r.text)

# ---------------------------------------------------------------- splits --
r = client.post("/api/v0.5/splits", headers=headers,
                 json={"account_id": bank_id, "category_id": food_id, "owner_share": "150.00",
                       "friend_shares": [{"friend_id": rahul_id, "amount": "350.00"}], "title": "Group dinner"})
check("create split", r.status_code == 201, r.text)

r = client.post("/api/v0.5/splits/fronted", headers=headers,
                 json={"category_id": food_id, "friend_id": rahul_id, "amount": "50.00", "title": "Tea"})
check("create fronted expense", r.status_code == 201, r.text)

r = client.get("/api/v0.5/friends/balances", headers=headers)
check("friend balance nets split - fronted", r.status_code == 200 and r.json()[0]["balance"]["major"] == "INR 300.00", r.text)

# ------------------------------------------------------------- transfer --
r = client.post("/api/v0.5/transfers", headers=headers,
                 json={"from_account_id": bank_id, "to_account_id": cc_id, "amount": "100.00"})
check("liability transfer over-outstanding -> 422", r.status_code == 422, r.text)

# --------------------------------------------------------- settlements --
r = client.post("/api/v0.5/settlements", headers=headers,
                 json={"friend_id": rahul_id, "account_id": bank_id, "amount": "300.00"})
check("settle full friend balance", r.status_code == 201, r.text)

r = client.get("/api/v0.5/friends/balances", headers=headers)
check("friend balance now zero after full settlement",
      r.status_code == 200 and len(r.json()) == 1 and r.json()[0]["balance"]["points"] == 0, r.text)

# ------------------------------------------------------------- reports --
r = client.get("/api/v0.5/reports/dashboard", headers=headers)
check("GET /reports/dashboard", r.status_code == 200, r.text)

r = client.get("/api/v0.5/reports/net-worth", headers=headers)
check("GET /reports/net-worth", r.status_code == 200, r.text)

r = client.get("/api/v0.5/reports/budget", headers=headers)
check("GET /reports/budget shows food category over/under", r.status_code == 200 and len(r.json()) == 1, r.text)

r = client.get("/api/v0.5/reports/reference-data", headers=headers)
check("GET /reports/reference-data", r.status_code == 200, r.text)

r = client.get("/api/v0.5/reports/trends/cashflow", headers=headers)
check("GET /reports/trends/cashflow", r.status_code == 200, r.text)

# ------------------------------------------------------ docs disabled ----
check("docs enabled in dev mode", app.docs_url == "/docs")

print()
if FAILURES:
    print(f"{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
else:
    print(f"ALL CHECKS PASSED ({len(client.headers)} default headers, DB at {DB_PATH})")
    os.remove(DB_PATH)
    sys.exit(0)
