"""Demo mode: a ready-made sample ledger (a full year of activity) and a password-less session for it.

Enabled with MONETARY_DEMO_MODE=true. The sample ledger is generated on first use through the
normal application services (so every ledger invariant holds) into a *separate* database file, and
every date is relative to today so the data never looks stale. There is no schema change and no
committed database file: delete the demo database to reset it.

Safety: `ensure_demo_ledger` refuses to touch a database whose owner is not the demo owner, so a
misconfigured MONETARY_DB_PATH can never be filled with sample data or opened without a password.
"""

from __future__ import annotations

import random
from decimal import Decimal
from pathlib import Path
from datetime import date, timedelta

from monetary.application import account_service, identity_service, provisioning, split_service
from monetary.application import transaction_service
from monetary.application import settlement_service, transfer_service, user_service
from monetary.domain.enums import PlatformRole, UserStatus
from monetary.domain.exceptions import ConflictError
from monetary.domain.time_utils import utc_now_iso
from monetary.infrastructure import control_repository as crepo

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


# (category, low, high, weight, pays-with) for the generated older spending; deterministic (seeded).
_POOL = (
    ("Groceries", 35, 85, 3, "bank"), ("Coffee & Snacks", 3, 9, 3, "cash"),
    ("Restaurants", 15, 55, 2, "card"), ("Public Transit", 2, 12, 2, "cash"),
    ("Cab & Taxi", 8, 30, 1, "card"), ("Shopping", 15, 120, 1, "card"),
    ("Entertainment", 8, 40, 1, "card"), ("Health", 10, 60, 1, "bank"), ("Fuel", 30, 55, 1, "bank"),
)
_YEAR = 365


def _generated_expenses() -> list[tuple[int, str, str, str, str]]:
    rng = random.Random(2026)
    names = [p[0] for p in _POOL]
    weights = [p[3] for p in _POOL]
    out = []
    for days_ago in range(max(d for d, *_ in _EXPENSES) + 1, _YEAR - 4):
        if rng.random() > 0.9:
            continue
        name, lo, hi, _w, payer = _POOL[names.index(rng.choices(names, weights)[0])]
        out.append((days_ago, name, f"{rng.uniform(lo, hi):.2f}", name, payer))
    # a few bigger one-offs spread over the year
    for days_ago, name, amount, desc in ((95, "Travel", "240.00", "Weekend trip"), (150, "Shopping", "180.00", "Winter jacket"),
                                         (210, "Education", "59.00", "Book bundle"), (270, "Travel", "310.00", "Flights"),
                                         (330, "Entertainment", "85.00", "Concert tickets")):
        out.append((days_ago, name, amount, desc, "card"))
    return out


def _day(days_ago: int) -> str:
    return (date.today() - timedelta(days=days_ago)).isoformat()


def _find(items: list[dict], name: str) -> dict:
    return next(i for i in items if i["name"] == name)


def ensure_demo_account(control, data_dir: str | Path) -> dict:
    """Return the demo account, creating it and its sample ledger when the data directory is empty.

    The demo account has no password (it is entered through /auth/demo). Raises ConflictError when the
    control database already holds a real account, so a misconfigured MONETARY_DATA_DIR can never be
    filled with sample data or opened without a password."""
    existing = crepo.get_user_by_email(control, DEMO_OWNER_EMAIL)
    if existing is not None:
        return existing
    if crepo.count_users(control) > 0:
        raise ConflictError(
            "Demo mode is on but this data directory holds real accounts; refusing to use it. "
            "Unset MONETARY_DEMO_MODE or point MONETARY_DATA_DIR at an empty directory.")
    now = utc_now_iso()
    account = crepo.create_user(
        control, email=DEMO_OWNER_EMAIL, name=DEMO_OWNER_NAME, password_hash=None,
        security_question_id=None, security_answer_hash=None, role=PlatformRole.USER.value,
        status=UserStatus.ACTIVE.value, timezone=DEMO_TIMEZONE, home_currency_code=DEMO_CURRENCY,
        approved_at=now, now=now)
    provisioning.provision_ledger(control, data_dir, account["id"], seed_defaults=True)
    ledger = provisioning.open_ledger(control, data_dir, account["id"])
    try:
        _build(ledger, user_service.require_owner(ledger))
        ledger.commit()
    finally:
        ledger.close()
    return account


def reset_demo_data(data_dir: str | Path) -> None:
    """Delete the demo control database and ledgers so the next `ensure_demo_account` rebuilds them.

    Only ever removes a data directory that is empty or holds nothing but the demo account; a real
    one raises ConflictError and is left untouched."""
    from monetary.infrastructure import control_db, tenant_store

    directory = Path(data_dir)
    control_file = directory / control_db.CONTROL_DB_FILENAME
    if not control_file.exists():
        return
    control = control_db.connect_control(directory)
    try:
        emails = {u["email"] for u in crepo.list_users(control)}
    finally:
        control.close()
    if emails - {DEMO_OWNER_EMAIL}:
        raise ConflictError("Refusing to reset: this data directory holds real accounts, not just the demo.")
    for suffix in ("", "-wal", "-shm"):
        Path(str(control_file) + suffix).unlink(missing_ok=True)
    tenants = tenant_store.tenants_dir(directory)
    for leftover in tenants.glob("*"):
        leftover.unlink(missing_ok=True)


def start_demo_session(control, data_dir: str | Path) -> tuple[dict, str]:
    """Create (if needed) the demo account and ledger and open a session for it."""
    account = ensure_demo_account(control, data_dir)
    return account, identity_service.start_session(control, account)


def _build(conn, owner: dict) -> None:
    def account(name, subtype, opening, **extra):
        return account_service.create_account_with_opening_balance(
            conn, owner, name=name, account_type="ASSET", currency_code=DEMO_CURRENCY, subtype=subtype,
            opening_balance_major=opening, opening_date=_day(_YEAR), **extra)

    bank = account("Everyday Bank", "bank", "1500.00")
    savings = account("Savings", "bank", "4000.00")
    cash = account("Cash", "cash", "150.00")
    card = account_service.create_account_with_opening_balance(
        conn, owner, name="Credit Card", account_type="LIABILITY", currency_code=DEMO_CURRENCY,
        subtype="credit_card", credit_limit_major="2500.00", statement_day=25,
        opening_date=_day(_YEAR))
    sources = {"bank": bank, "cash": cash, "card": card}

    categories = account_service.list_categories(conn)
    cat = lambda name: _find(categories, name)["id"]  # noqa: E731

    # Twelve months of salary, rent, bills, saving, cash top-ups and card repayments.
    for m in range(12):
        base = m * 30 + 2
        transaction_service.record_income(
            conn, owner, account_id=bank["id"], category_id=cat("Salary"),
            amount_major="2900.00" if m < 6 else "2750.00", description="Monthly salary", date_str=_day(base))
        transaction_service.record_expense(
            conn, owner, account_id=bank["id"], category_id=cat("Rent"), amount_major="1050.00",
            description="Rent", date_str=_day(base + 1))
        transaction_service.record_expense(
            conn, owner, account_id=bank["id"], category_id=cat("Bills & Subscriptions"), amount_major="29.99",
            description="Phone plan", date_str=_day(base + 3))
        transaction_service.record_expense(
            conn, owner, account_id=bank["id"], category_id=cat("Utilities"),
            amount_major=f"{70 + (m * 7) % 25}.{(m * 13) % 100:02d}", description="Electricity bill", date_str=_day(base + 4))
        transaction_service.record_expense(
            conn, owner, account_id=bank["id"], category_id=cat("Entertainment"), amount_major="15.99",
            description="Streaming subscription", date_str=_day(base + 5))
        transfer_service.create_transfer(
            conn, owner, from_account_id=bank["id"], to_account_id=savings["id"], amount_major="300.00",
            description="Monthly saving", date_str=_day(base + 6))
        transfer_service.create_transfer(
            conn, owner, from_account_id=bank["id"], to_account_id=cash["id"], amount_major="50.00",
            description="Cash withdrawal", date_str=_day(base + 7))
    for days_ago, amount in ((17, "420.00"), (120, "350.00"), (205, "600.00"), (300, "280.00")):
        transaction_service.record_income(
            conn, owner, account_id=bank["id"], category_id=cat("Freelance"), amount_major=amount,
            description="Freelance project", date_str=_day(days_ago))

    # Everyday spending: the hand-written recent weeks, then seeded generated history.
    expenses = [(d, c, a, desc, "card" if i % 3 == 0 else "cash" if i % 7 == 0 else "bank")
                for i, (d, c, a, desc) in enumerate(_EXPENSES)] + _generated_expenses()
    card_charges: list[tuple[int, Decimal]] = []
    for days_ago, category, amount, description, payer in sorted(expenses, reverse=True):
        transaction_service.record_expense(
            conn, owner, account_id=sources[payer]["id"], category_id=cat(category), amount_major=amount,
            description=description, date_str=_day(days_ago))
        if payer == "card":
            card_charges.append((days_ago, Decimal(amount)))
    # Pay the card off every month, covering the charges older than the payment date.
    for m in range(12):
        pay_day = m * 30 + 1
        owed = sum((a for d, a in card_charges if pay_day < d <= pay_day + 30), Decimal(0))
        if owed > 0:
            transfer_service.create_transfer(
                conn, owner, from_account_id=bank["id"], to_account_id=card["id"], amount_major=str(owed),
                description="Credit card payment", date_str=_day(pay_day))

    # Shared costs with friends across the year, and some paybacks.
    alex, sam = (user_service.add_friend(conn, name=n, email=e) for n, e in _FRIENDS)
    for days_ago, friend, total, share, category, description in (
        (7, (alex, sam), "90.00", "30.00", "Restaurants", "Team dinner (split three ways)"),
        (12, (alex,), "90.00", "45.00", "Groceries", "Shared groceries"),
        (58, (sam,), "64.00", "32.00", "Entertainment", "Concert tickets for two"),
        (101, (alex, sam), "120.00", "40.00", "Travel", "Weekend cabin (split three ways)"),
        (160, (alex,), "56.00", "28.00", "Restaurants", "Birthday lunch"),
        (233, (sam,), "88.00", "44.00", "Groceries", "Shared groceries"),
        (301, (alex, sam), "75.00", "25.00", "Entertainment", "Game night snacks and tickets"),
    ):
        split_service.create_split_expense(
            conn, owner, account_id=bank["id"], category_id=cat(category), owner_share_major=share,
            friend_shares=[(f["id"], share) for f in friend], description=description, date_str=_day(days_ago))
    split_service.create_friend_fronted_expense(
        conn, owner, category_id=cat("Travel"), friend_id=sam["id"], amount_major="80.00",
        description="Sam paid for the cab to the airport", date_str=_day(20))
    for days_ago, friend, amount, note in ((3, alex, "20.00", "Alex paid back part of it"),
                                           (45, sam, "32.00", "Sam settled up"),
                                           (95, alex, "28.00", "Alex paid back")):
        settlement_service.create_settlement(
            conn, owner, friend_id=friend["id"], account_id=bank["id"], amount_major=amount,
            description=note, date_str=_day(days_ago))
