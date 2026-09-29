"""Fixtures for service-level tests: real DB, real services, no HTTP."""
import pytest

from duevia.application import account_service, user_service
from duevia.domain.enums import AccountType
from duevia.infrastructure import repositories as repo
from tests import sample_data as sd


class Ctx:
    """Owner + sample accounts/categories/friends created directly via services."""

    def __init__(self, conn):
        self.conn = conn
        self.owner = user_service.bootstrap_owner(
            conn, name=sd.OWNER["name"], email=sd.OWNER["email"], timezone=sd.OWNER["timezone"],
            home_currency_code=sd.OWNER["currency"], password=sd.OWNER["password"],
            security_question_id=1, security_answer="x")
        self.acct = {k: account_service.create_account(
            conn, name=v["name"], account_type=v["type"], currency_code=v["currency"])["id"]
            for k, v in sd.ACCOUNTS.items()}
        self.cat = {}
        for k, v in sd.CATEGORIES.items():
            self.cat[k] = account_service.create_category(
                conn, name=v["name"], category_type=v["type"], currency_code=v["currency"],
                budget_limit_major=v.get("budget_limit"),
                parent_id=self.cat[v["parent"]] if "parent" in v else None)["id"]
        self.friend = {k: user_service.add_friend(conn, name=v["name"], email=v["email"])["id"]
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
