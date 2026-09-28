"""Second smoke test: CORS rules, edit/delete flows, STRICT ledger mode."""
import os, sys, tempfile
fd, DB = tempfile.mkstemp(suffix=".db"); os.close(fd); os.remove(DB)
os.environ["DUEVIA_DB_PATH"] = DB
os.environ["DUEVIA_ENV"] = "development"
os.environ["DUEVIA_CORS_ORIGINS"] = "http://localhost:3000"
sys.path.insert(0, os.getcwd())
from fastapi.testclient import TestClient
from duevia.presentation.api.app import app
c = TestClient(app); F = []
def check(l, ok, x=""):
    print(("[OK] " if ok else "[FAIL] ") + l, "" if ok else x)
    if not ok: F.append(l)

r = c.post("/api/v0.5/setup/init", json={"name":"O","email":"o@x.com","currency":"INR","password":"password123","security_question_id":2,"security_answer":"a"})
H = {"Authorization": "Bearer " + r.json()["access_token"]}
J = lambda m,u,**k: getattr(c,m)("/api/v0.5"+u, headers=H, **k)
bank = J("post","/accounts",json={"name":"Bank","type":"ASSET","currency":"INR"}).json()["id"]
bank2 = J("post","/accounts",json={"name":"Wallet","type":"ASSET","currency":"INR"}).json()["id"]
food = J("post","/categories",json={"name":"Food","type":"EXPENSE"}).json()["id"]
fr = J("post","/friends",json={"name":"Ann","email":"ann@x.com"}).json()["id"]
bal = lambda a: J("get",f"/accounts/{a}/balance").json()["balance"]["points"]

# CORS
r = c.options("/api/v0.5/owner", headers={"Origin":"http://localhost:3000","Access-Control-Request-Method":"GET"})
check("CORS allowed origin", r.headers.get("access-control-allow-origin")=="http://localhost:3000", r.headers)
r = c.options("/api/v0.5/owner", headers={"Origin":"http://evil.com","Access-Control-Request-Method":"GET"})
check("CORS disallowed origin", "access-control-allow-origin" not in r.headers)
r = c.get("/health")
check("security headers present", r.headers.get("x-content-type-options")=="nosniff" and r.headers.get("x-frame-options")=="DENY")

# DIRECT mode edit/delete
J("post","/transactions/adjustment",json={"account_id":bank,"amount":"1000","side":"DEBIT","title":"seed"})
e = J("post","/transactions/expense",json={"account_id":bank,"category_id":food,"amount":"100","title":"Lunch"}).json()["id"]
check("balance after expense", bal(bank)==90000)
r = J("patch",f"/transactions/{e}",json={"amount":"150","title":"Big lunch"})
check("DIRECT edit amount", r.status_code==200 and bal(bank)==85000, r.text)
r = J("patch",f"/transactions/{e}",json={"account_id":bank2})
check("DIRECT edit account", r.status_code==200 and bal(bank)==100000 and bal(bank2)==-15000, r.text)
r = J("delete",f"/transactions/{e}")
check("DIRECT delete", r.status_code==200 and bal(bank2)==0, r.text)
check("deleted entry 404", J("get",f"/transactions/{e}").status_code==404)

# split edit/delete + settlement guard
s = J("post","/splits",json={"account_id":bank,"category_id":food,"owner_share":"50","friend_shares":[{"friend_id":fr,"amount":"50"}],"title":"S"}).json()["entry"]["id"]
J("post","/settlements",json={"friend_id":fr,"account_id":bank,"amount":"20"})
r = J("patch",f"/splits/{s}",json={"owner_share":"40"})
check("split edit blocked by settlement history -> 409", r.status_code==409, r.text)
r = J("patch",f"/splits/{s}",json={"owner_share":"40","force":True})
check("split edit with force", r.status_code==200, r.text)
r = J("delete",f"/splits/{s}?remove_settlements=true")
check("split delete remove_settlements", r.status_code==200, r.text)
check("friend balance back to 0", J("get","/friends/balances").json()[0]["balance"]["points"]==0)

# transfer edit/delete
t = J("post","/transfers",json={"from_account_id":bank,"to_account_id":bank2,"amount":"100"}).json()["id"]
r = J("patch",f"/transfers/{t}",json={"amount":"200"})
check("transfer edit", r.status_code==200 and bal(bank2)==20000, r.text)
check("transfer delete", J("delete",f"/transfers/{t}").status_code==200 and bal(bank2)==0)

# STRICT mode
J("patch","/owner",json={"ledger_mode":"STRICT"})
e = J("post","/transactions/expense",json={"account_id":bank,"category_id":food,"amount":"10","title":"Tea"}).json()["id"]
new = J("patch",f"/transactions/{e}",json={"amount":"25"}).json()
check("STRICT edit creates replacement entry", new["id"]!=e)
old = J("get",f"/transactions/{e}").json()
check("STRICT original marked REVERSED", old["status"]=="REVERSED" and old["reversed_by_id"] is not None)
check("STRICT balance correct", bal(bank)==100000-2500)
check("STRICT re-edit of reversed -> 409", J("patch",f"/transactions/{e}",json={"amount":"1"}).status_code==409)
lst = J("get","/transactions?limit=5").json()
check("pagination envelope", set(lst)=={"items","total","limit","offset"})

# validation
check("bad amount 422", J("post","/transactions/expense",json={"account_id":bank,"category_id":food,"amount":"1.234","title":"x"}).status_code==422)
check("empty title 422", J("post","/transactions/expense",json={"account_id":bank,"category_id":food,"amount":"1","title":""}).status_code==422)
check("huge amount rejected", J("post","/transactions/expense",json={"account_id":bank,"category_id":food,"amount":"9"*500,"title":"x"}).status_code==422)
print("FAILED:", F) if F else print("ALL EDIT/STRICT CHECKS PASSED")
sys.exit(1 if F else 0)
