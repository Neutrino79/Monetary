"""The superuser-only Platform facts and the audit-log CSV export."""
from __future__ import annotations

import csv
import io

from monetary.application import admin_service
from tests.api import test_roles
from tests.api.test_roles import ADMIN

boss = test_roles.boss
team = test_roles.team


def test_platform_is_for_the_superuser_only(client, boss, team):
    assert client.get(f"{ADMIN}/platform", headers=team["admin1"]).status_code == 403
    assert client.get(f"{ADMIN}/platform", headers=team["sam"]).status_code == 403
    assert client.get(f"{ADMIN}/platform").status_code == 401


def test_platform_shows_settings_and_size_but_no_secrets(client, boss, team, monkeypatch):
    monkeypatch.setenv("MONETARY_SECRET_KEY", "super-secret-value")  # pragma: allowlist secret
    monkeypatch.setenv("MONETARY_LOGIN_MAX_FAILURES", "7")
    body = client.get(f"{ADMIN}/platform", headers=boss).json()
    assert body["version"] and body["apiVersion"] and body["demoMode"] is False
    assert body["ledgerCount"] >= 1 and body["controlDbBytes"] > 0
    settings = {s["key"]: s["value"] for s in body["settings"]}
    assert settings["MONETARY_LOGIN_MAX_FAILURES"] == "7"
    assert "super-secret-value" not in str(body)
    assert not [k for k in settings if "SECRET" in k or k.endswith("_KEY")]


def test_an_admin_can_export_the_audit_log_as_csv(client, boss, team):
    ids = team["ids"]
    client.post(f"{ADMIN}/users/{ids['ravi']}/suspend", headers=team["admin1"], json={"reason": "=cmd()"})
    res = client.get(f"{ADMIN}/audit-log/export", headers=team["admin1"])
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert 'filename="audit-log.csv"' in res.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(res.text)))
    suspend = next(r for r in rows if r["action"] == "user.suspend")
    assert "admin1@example.com" in suspend["actor"] and "ravi@example.com" in suspend["target"]
    assert [int(r["id"]) for r in rows] == sorted((int(r["id"]) for r in rows), reverse=True)


def test_the_export_is_closed_to_ordinary_users(client, boss, team):
    assert client.get(f"{ADMIN}/audit-log/export", headers=team["sam"]).status_code == 403


def test_csv_cells_that_look_like_formulas_are_neutralised():
    assert admin_service._csv_safe("=1+1") == "'=1+1"
    assert admin_service._csv_safe("@sum") == "'@sum"
    assert admin_service._csv_safe(None) == ""
    assert admin_service._csv_safe(5) == "5"
