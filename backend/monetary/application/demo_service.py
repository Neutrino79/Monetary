"""Demo mode: a ready-made sample ledger and a password-less session for it.

Enabled with MONETARY_DEMO_MODE=true. The sample ledger is generated on first use through the
normal application services (so every ledger invariant holds) into a *separate* database file, and
every date is relative to today so the data never looks stale. There is no schema change and no
committed database file: delete the demo database to reset it.

Safety: `ensure_demo_ledger` refuses to touch a database whose owner is not the demo owner, so a
misconfigured MONETARY_DB_PATH can never be filled with sample data or opened without a password.
"""

from __future__ import annotations

import secrets
from datetime import date, timedelta

from monetary.application import account_service, seed_service, split_service, transaction_service
from monetary.application import settlement_service, transfer_service, user_service
from monetary.domain.exceptions import ConflictError
from monetary.infrastructure import repositories as repo

DEMO_OWNER_EMAIL = "demo@example.com"
DEMO_OWNER_NAME = "Demo User"
DEMO_CURRENCY = "USD"
DEMO_TIMEZONE = "UTC"

_FRIENDS = (("Alex Rivera", "alex@example.com"), ("Sam Chen", "sam@example.com"))
# (days ago, category, amount, description) -- small, plausible everyday spending.
_EXPENSES = (
    (1, "Coffee & Snacks", "4.50", "Morning coffee"),
    (2, "Groceries", "63.20", "Weekly groceries"),
    (3, "Public Transit", "2.75", "Metro fare"),
    (5, "Restaurants", "28.90", "Lunch with colleagues"),
    (6, "Utilities", "74.10", "Electricity bill"),
    (8, "Entertainment", "15.99", "Streaming subscription"),
    (9, "Groceries", "48.35", "Groceries"),
    (11, "Health", "22.00", "Pharmacy"),
    (13, "Cab & Taxi", "18.40", "Cab home"),
    (15, "Shopping", "54.00", "New headphones case"),
    (18, "Coffee & Snacks", "6.25", "Coffee and a pastry"),
    (21, "Groceries", "71.80", "Weekly groceries"),
    (24, "Restaurants", "36.50", "Dinner out"),
    (28, "Bills & Subscriptions", "29.99", "Phone plan"),
    (33, "Fuel", "44.00", "Fuel"),
    (40, "Education", "39.00", "Online course"),
    (47, "Groceries", "58.60", "Weekly groceries"),
    (55, "Travel", "120.00", "Train tickets"),
    (63, "Restaurants", "41.20", "Birthday dinner"),
    (75, "Shopping", "89.90", "Running shoes"),
)


def _day(days_ago: int) -> str:
    return (date.today() - timedelta(days=days_ago)).isoformat()


def _find(items: list[dict], name: str) -> dict:
    return next(i for i in items if i["name"] == name)


def is_demo_database(conn) -> bool:
    owner = repo.get_superuser(conn)
    return owner is not None and owner["email"] == DEMO_OWNER_EMAIL


def ensure_demo_ledger(conn) -> dict:
    """Return the demo owner, creating the sample ledger when the database is empty.

    Raises ConflictError when the database already holds a different (real) owner."""
    owner = repo.get_superuser(conn)
    if owner is not None:
        if owner["email"] != DEMO_OWNER_EMAIL:
            raise ConflictError(
                "Demo mode is on but this database belongs to a real owner; refusing to use it. "
                "Unset MONETARY_DEMO_MODE or point MONETARY_DB_PATH at an empty demo database.")
        return owner
    return _build(conn)


def start_demo_session(conn) -> tuple[dict, str]:
    """Create (if needed) the demo ledger and open a session for its owner."""
    owner = ensure_demo_ledger(conn)
    return owner, user_service.start_session(conn, owner)


def _build(conn) -> dict:
    # The owner's password is random and never shown: the demo is entered through /auth/demo.
    owner = user_service.bootstrap_owner(
        conn, name=DEMO_OWNER_NAME, email=DEMO_OWNER_EMAIL, timezone=DEMO_TIMEZONE,
        home_currency_code=DEMO_CURRENCY, password=secrets.token_urlsafe(24),
        security_question_id=1, security_answer=secrets.token_urlsafe(12))
    seed_service.seed_default_categories(conn, currency_code=DEMO_CURRENCY)

    def account(name, subtype, opening, **extra):
        return account_service.create_account_with_opening_balance(
            conn, owner, name=name, account_type="ASSET", currency_code=DEMO_CURRENCY, subtype=subtype,
            opening_balance_major=opening, opening_date=_day(90), **extra)

    bank = account("Everyday Bank", "bank", "1200.00")
    savings = account("Savings", "bank", "4000.00")
    cash = account("Cash", "cash", "150.00")
    card = account_service.create_account_with_opening_balance(
        conn, owner, name="Credit Card", account_type="LIABILITY", currency_code=DEMO_CURRENCY,
        subtype="credit_card", credit_limit_major="2500.00", statement_day=25,
        opening_date=_day(90))

    categories = account_service.list_categories(conn)
    cat = lambda name: _find(categories, name)["id"]  # noqa: E731

    for months_ago in (0, 1, 2):
        days = months_ago * 30 + 2
        transaction_service.record_income(
            conn, owner, account_id=bank["id"], category_id=cat("Salary"), amount_major="3200.00",
            description="Monthly salary", date_str=_day(days))
        transaction_service.record_expense(
            conn, owner, account_id=bank["id"], category_id=cat("Rent"), amount_major="950.00",
            description="Rent", date_str=_day(days + 1))
    transaction_service.record_income(
        conn, owner, account_id=bank["id"], category_id=cat("Freelance"), amount_major="420.00",
        description="Freelance logo project", date_str=_day(17))

    for i, (days, category, amount, description) in enumerate(_EXPENSES):
        source = card if i % 3 == 0 else cash if i % 7 == 0 else bank
        transaction_service.record_expense(
            conn, owner, account_id=source["id"], category_id=cat(category), amount_major=amount,
            description=description, date_str=_day(days))

    transfer_service.create_transfer(
        conn, owner, from_account_id=bank["id"], to_account_id=savings["id"], amount_major="300.00",
        description="Monthly saving", date_str=_day(4))

    friends = [user_service.add_friend(conn, name=n, email=e) for n, e in _FRIENDS]
    alex, sam = friends
    split_service.create_split_expense(
        conn, owner, account_id=bank["id"], category_id=cat("Restaurants"), owner_share_major="30.00",
        friend_shares=[(alex["id"], "30.00"), (sam["id"], "30.00")],
        description="Team dinner (split three ways)", date_str=_day(7))
    split_service.create_split_expense(
        conn, owner, account_id=bank["id"], category_id=cat("Groceries"), owner_share_major="45.00",
        friend_shares=[(alex["id"], "45.00")], description="Shared groceries", date_str=_day(12))
    split_service.create_friend_fronted_expense(
        conn, owner, category_id=cat("Travel"), friend_id=sam["id"], amount_major="80.00",
        description="Sam paid for the cab to the airport", date_str=_day(20))
    settlement_service.create_settlement(
        conn, owner, friend_id=alex["id"], account_id=bank["id"], amount_major="20.00",
        description="Alex paid back part of it", date_str=_day(3))
    return repo.get_superuser(conn)
