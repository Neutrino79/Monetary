"""Demo mode: MONETARY_DEMO_MODE exposes a password-less session on a generated sample ledger."""
import pytest

from monetary.application import demo_service
from monetary.config import DEFAULT_DEMO_DB_PATH, database_path_from_environment
from tests.support.sample_data import API, OWNER


@pytest.fixture()
def demo(monkeypatch):
    monkeypatch.setenv("MONETARY_DEMO_MODE", "true")


def _enter(client):
    r = client.post(f"{API}/auth/demo")
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_demo_endpoint_does_not_exist_by_default(client):
    assert client.post(f"{API}/auth/demo").status_code == 404
    assert client.get(f"{API}/meta").json()["demo"] is False


def test_meta_reports_demo(client, demo):
    assert client.get(f"{API}/meta").json()["demo"] is True


def test_demo_session_opens_a_populated_ledger(client, demo):
    headers = _enter(client)
    owner = client.get(f"{API}/owner", headers=headers).json()
    assert owner["email"] == demo_service.DEMO_OWNER_EMAIL
    accounts = client.get(f"{API}/accounts", headers=headers).json()
    assert {"Everyday Bank", "Savings", "Cash", "Credit Card"} <= {a["name"] for a in accounts}
    assert len(client.get(f"{API}/friends", headers=headers).json()) == 2
    assert client.get(f"{API}/splits", headers=headers).json()
    assert client.get(f"{API}/transactions", headers=headers).status_code == 200


def test_demo_ledger_is_created_once(client, demo, conn):
    _enter(client)
    first = conn.execute("SELECT COUNT(*) FROM journal_entry").fetchone()[0]
    _enter(client)
    assert conn.execute("SELECT COUNT(*) FROM journal_entry").fetchone()[0] == first > 20


def test_demo_dates_are_relative_to_today(client, demo, conn):
    from datetime import date
    _enter(client)
    newest = conn.execute("SELECT MAX(entry_date) FROM journal_entry").fetchone()[0]
    assert (date.today() - date.fromisoformat(newest[:10])).days <= 3


def test_password_changes_are_blocked_in_demo(client, demo):
    headers = _enter(client)
    r = client.post(f"{API}/auth/change-password", headers=headers,
                    json={"current_password": "x" * 12, "new_password": "y" * 12})
    assert r.status_code == 403
    r = client.post(f"{API}/auth/reset-password", json={
        "email": demo_service.DEMO_OWNER_EMAIL, "security_answer": "a", "new_password": "y" * 12})
    assert r.status_code == 403


def test_demo_refuses_a_real_database(client, demo):
    assert client.post(f"{API}/setup/init", json=OWNER).status_code == 201  # a real owner exists
    r = client.post(f"{API}/auth/demo")
    assert r.status_code == 409 and "real owner" in r.json()["detail"]


def test_default_path_is_separate_in_demo_mode(monkeypatch):
    monkeypatch.delenv("MONETARY_DB_PATH", raising=False)
    assert database_path_from_environment() is None
    monkeypatch.setenv("MONETARY_DEMO_MODE", "1")
    assert database_path_from_environment() == str(DEFAULT_DEMO_DB_PATH)
    monkeypatch.setenv("MONETARY_DB_PATH", "/tmp/x.db")
    assert database_path_from_environment() == "/tmp/x.db"


def test_startup_builds_ledger_and_fails_fast_on_real_db(client, demo, conn, db_path):
    from monetary.presentation.api.app import app, lifespan
    import asyncio

    async def run():
        async with lifespan(app):
            pass

    asyncio.run(run())
    assert demo_service.is_demo_database(conn)
    # a second start is a no-op; a real owner makes it refuse
    conn.execute("UPDATE user SET email='real@example.com' WHERE is_superuser=1")
    conn.commit()
    with pytest.raises(Exception, match="real owner"):
        asyncio.run(run())


def test_reset_rebuilds_the_demo_database(client, demo, conn, db_path):
    _enter(client)
    conn.execute("UPDATE user SET name='Edited by a visitor' WHERE is_superuser=1")
    conn.commit()
    conn.close()
    demo_service.reset_demo_database(db_path)
    import os
    assert not os.path.exists(db_path)
    headers = _enter(client)  # rebuilt on demand, edits gone
    assert client.get(f"{API}/owner", headers=headers).json()["name"] == demo_service.DEMO_OWNER_NAME


def test_reset_refuses_a_real_database(client, db_path):
    assert client.post(f"{API}/setup/init", json=OWNER).status_code == 201
    with pytest.raises(Exception, match="real owner"):
        demo_service.reset_demo_database(db_path)
    import os
    assert os.path.exists(db_path)


def test_reset_on_start_flag(monkeypatch):
    from monetary.config import demo_reset_on_start
    assert demo_reset_on_start() is False
    monkeypatch.setenv("MONETARY_DEMO_RESET", "true")
    assert demo_reset_on_start() is True
