"""Shared `ctx` fixture for service- and infrastructure-level tests: real DB, real services, no HTTP.

Registered for every test by tests/conftest.py."""
import pytest

from monetary.application import account_service, user_service
from monetary.domain.enums import AccountType
from monetary.infrastructure import repositories as repo
from tests.support import sample_data as sd


class Ctx:
    """Owner + sample accounts/categories/friends created directly via services."""

    def __init__(self, conn):
        self.conn = conn
        self.owner = user_service.create_ledger_settings(
            conn, timezone=sd.OWNER["timezone"], home_currency_code=sd.OWNER["currency"])
        self.acct = {k: account_service.create_account(
            conn, name=v["name"], account_type=v["type"], currency_code=v["currency"])["id"]
            for k, v in sd.ACCOUNTS.items()}
        self.cat = {}
        for k, v in sd.CATEGORIES.items():
            self.cat[k] = account_service.create_category(
                conn, name=v["name"], category_type=v["type"], currency_code=v["currency"],
                budget_limit_major=v.get("budget_limit"),
                parent_id=self.cat[v["parent"]] if "parent" in v else None)["id"]
        self.friend = {k: user_service.add_friend(
            conn, name=v["name"], email=v["email"], own_email=sd.OWNER["email"])["id"]
            for k, v in sd.FRIENDS.items()}
        self.equity = repo.get_system_account(conn, AccountType.EQUITY.value)["id"]

    def due(self, friend):
        return repo.get_due_account_for_friend(self.conn, self.friend[friend])["id"]

    def bal(self, account):
        pts, _ = account_service.get_balance(self.conn, self.acct[account])
        return pts


@pytest.fixture()
def ctx(conn):
    return Ctx(conn)
