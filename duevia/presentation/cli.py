"""Duevia 0.5.0 CLI — double-entry ledger, single owner, friends as DUE
accounts, configurable STRICT/DIRECT ledger mode."""

from __future__ import annotations

import argparse
import sqlite3
import sys

from duevia.application import (
    account_service,
    budget_service,
    dashboard_service,
    settlement_service,
    split_service,
    statement_service,
    transaction_service,
    transfer_service,
    user_service,
)
from duevia.config import CLI_NAME, PROJECT_NAME
from duevia.domain.exceptions import DomainError
from duevia.domain.money import MoneyError, format_signed
from duevia.domain.time_utils import parse_local_to_utc_iso
from duevia.infrastructure import db
from duevia.infrastructure import repositories as repo
from duevia.presentation.formatting import fmt_bool, fmt_dt, fmt_points, print_table


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def _require_owner(conn):
    return user_service.require_owner(conn)


def _parse_split_shares(raw: str) -> tuple[str, list[tuple[int, str]]]:
    """'0,2:200,3:200' -> ('0', [(2, '200'), (3, '200')]). The first value (no
    colon) is always the owner's own share -- explicit, can be zero."""
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        raise DomainError("At least the owner's share is required, e.g. '0,2:200'.")
    owner_part = parts[0]
    if ":" in owner_part:
        raise DomainError(
            "The first value in --shares must be the owner's own share with no "
            "friend id, e.g. '0,2:200' -- not a 'friend_id:amount' pair."
        )
    friend_shares = []
    for chunk in parts[1:]:
        if ":" not in chunk:
            raise DomainError(f"Invalid share entry {chunk!r}; expected 'friend_id:amount'.")
        fid_str, amount_str = chunk.split(":", 1)
        try:
            fid = int(fid_str.strip())
        except ValueError as exc:
            raise DomainError(f"Invalid friend id in share entry {chunk!r}.") from exc
        friend_shares.append((fid, amount_str.strip()))
    return owner_part, friend_shares


def _parse_year_month(raw: str) -> tuple[int, int]:
    parts = raw.strip().split("-")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise DomainError(f"Invalid month {raw!r}; expected 'YYYY-MM', e.g. '2026-09'.")
    year, month = int(parts[0]), int(parts[1])
    if not (1 <= month <= 12):
        raise DomainError(f"Invalid month {raw!r}: month must be between 01 and 12.")
    return year, month


# --------------------------------------------------------------------------- #
# init / owner
# --------------------------------------------------------------------------- #

def cmd_init(args, conn):
    owner = user_service.bootstrap_owner(
        conn, name=args.name, email=args.email, timezone=args.timezone,
        home_currency_code=args.currency, password=args.password,
        security_question_id=args.security_question, security_answer=args.security_answer,
    )
    print(f"Owner created: #{owner['id']} {owner['name']} <{owner['email']}> "
          f"(timezone={owner['timezone'] or 'UTC'}, home_currency={owner['home_currency_code']}, "
          f"ledger_mode={owner['ledger_mode']})")
    print("\nNote: the CLI talks to the database directly and never needs a login. "
          "The email/password/security question you just set are only used by the API "
          "(POST /api/v0.5/auth/login) when you wire up a UI.")


def cmd_owner_show(args, conn):
    o = _require_owner(conn)
    print(f"#{o['id']} {o['name']} <{o['email']}> timezone={o['timezone'] or 'UTC'} "
          f"home_currency={o['home_currency_code']} ledger_mode={o['ledger_mode']}")


def cmd_owner_rename(args, conn):
    o = user_service.rename_owner(conn, args.name)
    print(f"Owner renamed to {o['name']}.")


def cmd_owner_set_timezone(args, conn):
    o = user_service.set_owner_timezone(conn, args.timezone)
    print(f"Owner timezone set to {o['timezone'] or 'UTC'}.")


def cmd_owner_set_ledger_mode(args, conn):
    o = user_service.set_ledger_mode(conn, args.mode)
    print(f"Ledger mode set to {o['ledger_mode']}.")


def cmd_owner_change_password(args, conn):
    user_service.change_password(conn, current_password=args.current_password,
                                  new_password=args.new_password)
    print("Password changed. Every existing session (API login) has been invalidated.")


# --------------------------------------------------------------------------- #
# account
# --------------------------------------------------------------------------- #

def cmd_account_add(args, conn):
    acc = account_service.create_account(conn, name=args.name, account_type=args.type,
                                          currency_code=args.currency)
    print(f"Account created: #{acc['id']} {acc['name']} ({acc['account_type']}, {acc['currency_code']})")


def cmd_account_list(args, conn):
    accounts = account_service.list_accounts(conn, include_inactive=args.all)
    rows = [[a["id"], a["name"], a["account_type"], a["currency_code"], fmt_bool(a["is_active"])]
            for a in accounts]
    print_table(["ID", "Name", "Type", "Currency", "Active"], rows)


def cmd_account_deactivate(args, conn):
    acc = account_service.deactivate_account(conn, args.account_id)
    print(f"Account #{acc['id']} deactivated.")


def cmd_account_balance(args, conn):
    if args.account_id is not None:
        points, currency = account_service.get_balance(conn, args.account_id)
        print(f"Account #{args.account_id}: {format_signed(points, currency)}")
        return
    rows = statement_service.account_balances(conn, include_inactive=args.all)
    table = [[r["account_id"], r["name"], r["account_type"], format_signed(r["points"], r["currency"]),
              fmt_bool(r["is_active"])] for r in rows]
    print_table(["ID", "Name", "Type", "Balance", "Active"], table)


# --------------------------------------------------------------------------- #
# category
# --------------------------------------------------------------------------- #

def cmd_category_add(args, conn):
    o = _require_owner(conn)
    currency = args.currency or o["home_currency_code"]
    cat = account_service.create_category(
        conn, name=args.name, category_type=args.type, parent_id=args.parent,
        budget_limit_major=args.budget, currency_code=currency,
    )
    budget_note = f", budget={args.budget} {currency}" if args.budget else ""
    print(f"Category created: #{cat['id']} {cat['name']} ({cat['account_type']}, {currency}){budget_note}")


def cmd_category_list(args, conn):
    cats = account_service.list_categories(conn, include_inactive=args.all)
    rows = []
    for c in cats:
        budget = fmt_points(c["budget_limit"]) if c["budget_limit"] is not None else "-"
        rows.append([c["id"], c["name"], c["account_type"], c["currency_code"],
                     c["parent_account_id"] or "-", budget, fmt_bool(c["is_active"])])
    print_table(["ID", "Name", "Type", "Currency", "Parent", "Budget", "Active"], rows)


def cmd_category_deactivate(args, conn):
    cat = account_service.deactivate_category(conn, args.category_id)
    print(f"Category #{cat['id']} deactivated.")


# --------------------------------------------------------------------------- #
# friend
# --------------------------------------------------------------------------- #

def cmd_friend_add(args, conn):
    friend = user_service.add_friend(conn, name=args.name, email=args.email, currency_code=args.currency)
    due = repo.get_due_account_for_friend(conn, friend["id"])
    print(f"Friend created: #{friend['id']} {friend['name']} <{friend['email']}> "
          f"(DUE account #{due['id']}, {due['currency_code']})")


def cmd_friend_list(args, conn):
    friends = user_service.list_friends(conn)
    rows = [[f["id"], f["name"], f["email"]] for f in friends]
    print_table(["ID", "Name", "Email"], rows)


def cmd_friend_rename(args, conn):
    friend = user_service.rename_friend(conn, args.friend_id, args.name)
    print(f"Friend #{friend['id']} renamed to {friend['name']}.")


def cmd_friend_delete(args, conn):
    user_service.delete_friend(conn, args.friend_id)
    print(f"Friend #{args.friend_id} deleted.")


# --------------------------------------------------------------------------- #
# transaction
# --------------------------------------------------------------------------- #

def cmd_transaction_expense(args, conn):
    o = _require_owner(conn)
    entry = transaction_service.record_expense(
        conn, o, account_id=args.account, category_id=args.category, amount_major=args.amount,
        description=args.title, date_str=args.date, note=args.note,
    )
    print(f"Expense recorded: #{entry['id']} {entry['description']}")


def cmd_transaction_income(args, conn):
    o = _require_owner(conn)
    entry = transaction_service.record_income(
        conn, o, account_id=args.account, category_id=args.category, amount_major=args.amount,
        description=args.title, date_str=args.date, note=args.note,
    )
    print(f"Income recorded: #{entry['id']} {entry['description']}")


def cmd_transaction_refund(args, conn):
    o = _require_owner(conn)
    entry = transaction_service.record_refund(
        conn, o, for_entry_id=args.for_entry, amount_major=args.amount, account_id=args.account,
        category_id=args.category, description=args.title, date_str=args.date, note=args.note,
    )
    print(f"Refund recorded: #{entry['id']} {entry['description']}")


def cmd_transaction_adjustment(args, conn):
    o = _require_owner(conn)
    entry = transaction_service.record_adjustment(
        conn, o, account_id=args.account, amount_major=args.amount, side=args.side,
        description=args.title, date_str=args.date, note=args.note,
    )
    print(f"Adjustment recorded: #{entry['id']} {entry['description']}")


def cmd_transaction_edit(args, conn):
    o = _require_owner(conn)
    entry = transaction_service.edit_expense_or_income(
        conn, o, args.entry_id, account_id=args.account, category_id=args.category,
        amount_major=args.amount, description=args.title, date_str=args.date, note=args.note,
    )
    print(f"Edited: now #{entry['id']} {entry['description']} (mode={o['ledger_mode']})")


def cmd_transaction_delete(args, conn):
    o = _require_owner(conn)
    transaction_service.delete_entry(conn, o, args.entry_id)
    print(f"Entry #{args.entry_id} deleted (mode={o['ledger_mode']}).")


def cmd_transaction_show(args, conn):
    o = _require_owner(conn)
    entry = transaction_service.get_entry_or_raise(conn, args.entry_id)
    postings = repo.postings_for_entry(conn, args.entry_id)
    print(f"#{entry['id']} [{entry['entry_type']}/{entry['status']}] {entry['description']} "
          f"@ {fmt_dt(entry['entry_date'], o['timezone'])}")
    if entry["category_id"]:
        cat = repo.get_account(conn, entry["category_id"])
        print(f"  category: {cat['name']} (#{cat['id']})")
    if entry["memo"]:
        print(f"  memo: {entry['memo']}")
    if entry["refund_of_id"]:
        print(f"  refund of: #{entry['refund_of_id']}")
    if entry["reversal_of_id"]:
        print(f"  reverses: #{entry['reversal_of_id']}")
    if entry["reversed_by_id"]:
        print(f"  reversed by: #{entry['reversed_by_id']}")
    rows = []
    for p in postings:
        acc = repo.get_account(conn, p["account_id"])
        side = "DEBIT" if p["debit_amount"] > 0 else "CREDIT"
        amount = p["debit_amount"] or p["credit_amount"]
        rows.append([acc["id"], acc["name"], acc["account_type"], side, fmt_points(amount)])
    print_table(["Acct", "Name", "Type", "Side", "Amount"], rows)


def cmd_transaction_list(args, conn):
    o = _require_owner(conn)
    date_from = None
    date_to = None
    if args.date_from:
        date_from = parse_local_to_utc_iso(args.date_from, o["timezone"])
    if args.date_to:
        date_to = parse_local_to_utc_iso(args.date_to, o["timezone"])
    entries = transaction_service.list_entries(
        conn, account_id=args.account, category_id=args.category,
        include_reversed=args.include_reversed, date_from=date_from, date_to=date_to,
    )
    rows = []
    for e in entries:
        postings = repo.postings_for_entry(conn, e["id"])
        amount = max((p["debit_amount"] or p["credit_amount"]) for p in postings) if postings else 0
        rows.append([e["id"], e["entry_type"], e["status"], e["description"],
                     f"{fmt_points(amount)} {e['currency_code']}", fmt_dt(e["entry_date"], o["timezone"])])
    print_table(["ID", "Type", "Status", "Description", "Amount", "When"], rows)


# --------------------------------------------------------------------------- #
# split
# --------------------------------------------------------------------------- #

def cmd_split_create(args, conn):
    o = _require_owner(conn)
    owner_share, friend_shares = _parse_split_shares(args.shares)
    entry = split_service.create_split_expense(
        conn, o, account_id=args.account, category_id=args.category,
        owner_share_major=owner_share, friend_shares=friend_shares,
        description=args.title, date_str=args.date, note=args.note,
    )
    print(f"Split expense recorded: #{entry['id']} {entry['description']}")


def cmd_split_fronted(args, conn):
    o = _require_owner(conn)
    entry = split_service.create_friend_fronted_expense(
        conn, o, category_id=args.category, friend_id=args.friend, amount_major=args.amount,
        description=args.title, date_str=args.date, note=args.note,
    )
    print(f"Friend-fronted expense recorded: #{entry['id']} {entry['description']}")


def cmd_split_edit(args, conn):
    o = _require_owner(conn)
    entry = transaction_service.get_entry_or_raise(conn, args.entry_id)
    owner_share, friend_shares = (
        _parse_split_shares(args.shares) if args.shares else (None, None)
    )
    if entry["entry_type"] == "SPLIT":
        entry = split_service.edit_split(
            conn, o, args.entry_id, account_id=args.account, category_id=args.category,
            owner_share_major=owner_share, friend_shares=friend_shares,
            description=args.title, date_str=args.date, note=args.note,
            force=args.force, remove_settlements=args.remove_settlements,
        )
    else:
        entry = split_service.edit_fronted_expense(
            conn, o, args.entry_id, category_id=args.category, friend_id=args.friend,
            amount_major=args.amount, description=args.title, date_str=args.date, note=args.note,
            force=args.force, remove_settlements=args.remove_settlements,
        )
    print(f"Split updated: now #{entry['id']} {entry['description']} (mode={o['ledger_mode']})")


def cmd_split_delete(args, conn):
    o = _require_owner(conn)
    split_service.delete_split(conn, o, args.entry_id, force=args.force,
                                remove_settlements=args.remove_settlements)
    print(f"Split #{args.entry_id} deleted (mode={o['ledger_mode']}).")


def cmd_split_show(args, conn):
    o = _require_owner(conn)
    comp = split_service.split_composition(conn, args.entry_id)
    entry = comp["entry"]
    print(f"#{entry['id']} [{entry['entry_type']}] {entry['description']} — {entry['currency_code']}")
    rows = [[o["id"], o["name"] + " (you)", str(comp["owner_share"])]] if comp["owner_share"].points > 0 else []
    rows += [[f["friend_id"], f["friend_name"], str(f["amount"])] for f in comp["friends"]]
    print_table(["ID", "Name", "Share"], rows)


def cmd_split_list(args, conn):
    o = _require_owner(conn)
    entries = split_service.list_splits(conn, entry_type=args.type)
    rows = []
    for e in entries:
        postings = repo.postings_for_entry(conn, e["id"])
        amount = max((p["debit_amount"] or p["credit_amount"]) for p in postings) if postings else 0
        rows.append([e["id"], e["entry_type"], e["status"], e["description"],
                     f"{fmt_points(amount)} {e['currency_code']}", fmt_dt(e["entry_date"], o["timezone"])])
    print_table(["ID", "Type", "Status", "Description", "Amount", "When"], rows)


# --------------------------------------------------------------------------- #
# transfer
# --------------------------------------------------------------------------- #

def cmd_transfer_create(args, conn):
    o = _require_owner(conn)
    entry = transfer_service.create_transfer(
        conn, o, from_account_id=args.from_account, to_account_id=args.to_account,
        amount_major=args.amount, description=args.description, date_str=args.date,
    )
    print(f"Transfer recorded: #{entry['id']} {entry['description']}")


def cmd_transfer_list(args, conn):
    o = _require_owner(conn)
    entries = transfer_service.list_transfers(conn)
    rows = []
    for e in entries:
        postings = repo.postings_for_entry(conn, e["id"])
        amount = postings[0]["debit_amount"] or postings[0]["credit_amount"] if postings else 0
        rows.append([e["id"], e["status"], e["description"], f"{fmt_points(amount)} {e['currency_code']}",
                     fmt_dt(e["entry_date"], o["timezone"])])
    print_table(["ID", "Status", "Description", "Amount", "When"], rows)


def cmd_transfer_edit(args, conn):
    o = _require_owner(conn)
    entry = transfer_service.edit_transfer(
        conn, o, args.entry_id, from_account_id=args.from_account, to_account_id=args.to_account,
        amount_major=args.amount, description=args.description, date_str=args.date,
    )
    print(f"Transfer updated: now #{entry['id']} {entry['description']} (mode={o['ledger_mode']})")


def cmd_transfer_delete(args, conn):
    o = _require_owner(conn)
    transfer_service.delete_transfer(conn, o, args.entry_id)
    print(f"Transfer #{args.entry_id} deleted (mode={o['ledger_mode']}).")


# --------------------------------------------------------------------------- #
# settlement
# --------------------------------------------------------------------------- #

def cmd_settlement_create(args, conn):
    o = _require_owner(conn)
    entry = settlement_service.create_settlement(
        conn, o, friend_id=args.friend, account_id=args.account, amount_major=args.amount,
        description=args.description, date_str=args.date, note=args.note,
    )
    print(f"Settlement recorded: #{entry['id']} {entry['description']}")


def cmd_settlement_edit(args, conn):
    o = _require_owner(conn)
    entry = settlement_service.edit_settlement(
        conn, o, args.entry_id, friend_id=args.friend, account_id=args.account,
        amount_major=args.amount, description=args.description, date_str=args.date,
        note=args.note,
    )
    print(f"Settlement updated: now #{entry['id']} {entry['description']} (mode={o['ledger_mode']})")


def cmd_settlement_delete(args, conn):
    o = _require_owner(conn)
    settlement_service.delete_settlement(conn, o, args.entry_id)
    print(f"Settlement #{args.entry_id} deleted (mode={o['ledger_mode']}).")


def cmd_settlement_list(args, conn):
    o = _require_owner(conn)
    entries = settlement_service.list_settlements(conn, friend_id=args.friend)
    rows = []
    for e in entries:
        postings = repo.postings_for_entry(conn, e["id"])
        amount = postings[0]["debit_amount"] or postings[0]["credit_amount"] if postings else 0
        rows.append([e["id"], e["description"], f"{fmt_points(amount)} {e['currency_code']}",
                     fmt_dt(e["entry_date"], o["timezone"])])
    print_table(["ID", "Description", "Amount", "When"], rows)


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #

def cmd_report_balance(args, conn):
    cmd_account_balance(argparse.Namespace(account_id=None, all=args.all), conn)


def cmd_report_budget(args, conn):
    o = _require_owner(conn)
    year, month = _parse_year_month(args.month) if args.month else (None, None)
    statuses = budget_service.budget_status(conn, o, year=year, month=month)
    rows = []
    for s in statuses:
        rows.append([
            s["category_id"], s["category_name"], f"{s['year']}-{s['month']:02d}",
            str(s["budget"]), str(s["spent"]), format_signed(s["remaining_points"], s["currency"]),
            f"{s['percentage_used']:.1f}%", "OVER" if s["over_budget"] else "ok",
        ])
    print_table(["Cat ID", "Category", "Period", "Budget", "Spent", "Remaining", "% Used", "Status"], rows)


def cmd_report_friends(args, conn):
    rows = statement_service.friend_balances(conn)
    table = [[r["friend_id"], r["friend_name"], format_signed(r["points"], r["currency"])] for r in rows]
    print_table(["Friend ID", "Name", "Balance (+they owe you / -you owe them)"], table)


def cmd_report_statement(args, conn):
    o = _require_owner(conn)
    due = repo.get_due_account_for_friend(conn, args.friend)
    if due is None:
        print("No DUE account found for that friend.")
        return
    rows = statement_service.friend_statement(conn, due["id"])
    table = [[r["entry_id"], r["entry_type"], r["status"], r["description"],
              format_signed(r["delta_points"], due["currency_code"]),
              format_signed(r["running_balance_points"], due["currency_code"]),
              fmt_dt(r["entry_date"], o["timezone"])] for r in rows]
    print_table(["Entry", "Type", "Status", "Description", "Delta", "Running Balance", "When"], table)


def cmd_report_net_worth(args, conn):
    rows = dashboard_service.net_worth(conn)
    table = [[r["currency"], format_signed(r["assets"], r["currency"]),
              format_signed(r["liabilities"], r["currency"]), format_signed(r["net_worth"], r["currency"])]
             for r in rows]
    print_table(["Currency", "Total Assets", "Total Liabilities", "Net Worth"], table)


def cmd_report_spending(args, conn):
    o = _require_owner(conn)
    year, month = _parse_year_month(args.month) if args.month else (None, None)
    rows = dashboard_service.category_totals(conn, o, "EXPENSE", year=year, month=month)
    table = [[r["category_id"], r["category_name"], format_signed(r["total_points"], r["currency"])]
             for r in rows]
    print_table(["Cat ID", "Category", "Spent"], table)


def cmd_report_income(args, conn):
    o = _require_owner(conn)
    year, month = _parse_year_month(args.month) if args.month else (None, None)
    rows = dashboard_service.category_totals(conn, o, "INCOME", year=year, month=month)
    table = [[r["category_id"], r["category_name"], format_signed(r["total_points"], r["currency"])]
             for r in rows]
    print_table(["Cat ID", "Category", "Earned"], table)


def cmd_report_dashboard(args, conn):
    o = _require_owner(conn)
    year, month = _parse_year_month(args.month) if args.month else (None, None)
    d = dashboard_service.dashboard(conn, o, year=year, month=month)

    print(f"===== Dashboard — {d['year']}-{d['month']:02d} =====\n")

    print("-- Net worth --")
    nw_rows = [[r["currency"], format_signed(r["assets"], r["currency"]),
                format_signed(r["liabilities"], r["currency"]), format_signed(r["net_worth"], r["currency"])]
               for r in d["net_worth"]]
    print_table(["Currency", "Assets", "Liabilities", "Net Worth"], nw_rows)

    print("\n-- Accounts --")
    acc_rows = [[r["account_id"], r["name"], r["account_type"], format_signed(r["points"], r["currency"])]
                for r in d["account_balances"] if r["is_active"]]
    print_table(["ID", "Name", "Type", "Balance"], acc_rows)

    print("\n-- Budget status --")
    b_rows = [[s["category_id"], s["category_name"], str(s["budget"]), str(s["spent"]),
               format_signed(s["remaining_points"], s["currency"]),
               f"{s['percentage_used']:.0f}%", "OVER" if s["over_budget"] else "ok"]
              for s in d["budget_status"]]
    print_table(["Cat ID", "Category", "Budget", "Spent", "Remaining", "% Used", "Status"], b_rows)

    print("\n-- Top spending this month --")
    ts_rows = [[r["category_id"], r["category_name"], format_signed(r["total_points"], r["currency"])]
               for r in d["top_spending"]]
    print_table(["Cat ID", "Category", "Spent"], ts_rows)

    print("\n-- Income this month --")
    inc_rows = [[r["category_id"], r["category_name"], format_signed(r["total_points"], r["currency"])]
                for r in d["income_summary"]]
    print_table(["Cat ID", "Category", "Earned"], inc_rows)

    print("\n-- Friend balances --")
    f_rows = [[r["friend_id"], r["friend_name"], format_signed(r["points"], r["currency"])]
              for r in d["friend_balances"]]
    print_table(["Friend ID", "Name", "Balance (+owed to you / -you owe)"], f_rows)


# --------------------------------------------------------------------------- #
# parser
# --------------------------------------------------------------------------- #

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=CLI_NAME,
        description=f"{PROJECT_NAME} command-line interface for double-entry bookkeeping.",
    )
    parser.add_argument("--db-path", default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="Bootstrap the single application owner.")
    p.add_argument("--name", required=True)
    p.add_argument("--email", required=True)
    p.add_argument("--timezone", default=None)
    p.add_argument("--currency", required=True, help="Home currency, e.g. INR")
    p.add_argument("--password", required=True, help="Used for API login (min 8 characters).")
    p.add_argument("--security-question", type=int, required=True, choices=[1, 2, 3, 4, 5],
                    help="1=first pet, 2=mother's maiden name, 3=first school, "
                         "4=city born in, 5=childhood nickname -- used to reset a forgotten password.")
    p.add_argument("--security-answer", required=True)
    p.set_defaults(func=cmd_init)

    owner = sub.add_parser("owner", help="Manage the owner's own profile.")
    owner_sub = owner.add_subparsers(dest="subcommand", required=True)
    p = owner_sub.add_parser("show"); p.set_defaults(func=cmd_owner_show)
    p = owner_sub.add_parser("rename"); p.add_argument("--name", required=True); p.set_defaults(func=cmd_owner_rename)
    p = owner_sub.add_parser("set-timezone"); p.add_argument("--timezone", required=True); p.set_defaults(func=cmd_owner_set_timezone)
    p = owner_sub.add_parser("set-ledger-mode")
    p.add_argument("--mode", required=True, choices=["STRICT", "DIRECT"])
    p.set_defaults(func=cmd_owner_set_ledger_mode)
    p = owner_sub.add_parser("change-password")
    p.add_argument("--current-password", required=True)
    p.add_argument("--new-password", required=True)
    p.set_defaults(func=cmd_owner_change_password)

    account = sub.add_parser("account", help="Manage real accounts.")
    account_sub = account.add_subparsers(dest="subcommand", required=True)
    p = account_sub.add_parser("add")
    p.add_argument("--name", required=True)
    p.add_argument("--type", required=True, choices=["ASSET", "LIABILITY"])
    p.add_argument("--currency", required=True)
    p.set_defaults(func=cmd_account_add)
    p = account_sub.add_parser("list"); p.add_argument("--all", action="store_true"); p.set_defaults(func=cmd_account_list)
    p = account_sub.add_parser("deactivate"); p.add_argument("account_id", type=int); p.set_defaults(func=cmd_account_deactivate)
    p = account_sub.add_parser("balance")
    p.add_argument("account_id", type=int, nargs="?", default=None)
    p.add_argument("--all", action="store_true")
    p.set_defaults(func=cmd_account_balance)

    category = sub.add_parser("category", help="Manage categories.")
    category_sub = category.add_subparsers(dest="subcommand", required=True)
    p = category_sub.add_parser("add")
    p.add_argument("--name", required=True)
    p.add_argument("--type", required=True, choices=["EXPENSE", "INCOME"])
    p.add_argument("--parent", type=int, default=None)
    p.add_argument("--budget", default=None)
    p.add_argument("--currency", default=None, help="Defaults to your home currency.")
    p.set_defaults(func=cmd_category_add)
    p = category_sub.add_parser("list"); p.add_argument("--all", action="store_true"); p.set_defaults(func=cmd_category_list)
    p = category_sub.add_parser("deactivate"); p.add_argument("category_id", type=int); p.set_defaults(func=cmd_category_deactivate)

    friend = sub.add_parser("friend", help="Manage friends.")
    friend_sub = friend.add_subparsers(dest="subcommand", required=True)
    p = friend_sub.add_parser("add")
    p.add_argument("--name", required=True)
    p.add_argument("--email", required=True)
    p.add_argument("--currency", default=None)
    p.set_defaults(func=cmd_friend_add)
    p = friend_sub.add_parser("list"); p.set_defaults(func=cmd_friend_list)
    p = friend_sub.add_parser("rename"); p.add_argument("friend_id", type=int); p.add_argument("--name", required=True); p.set_defaults(func=cmd_friend_rename)
    p = friend_sub.add_parser("delete"); p.add_argument("friend_id", type=int); p.set_defaults(func=cmd_friend_delete)

    txn = sub.add_parser("transaction", help="Record and manage transactions.")
    txn_sub = txn.add_subparsers(dest="subcommand", required=True)

    def _common(sp, with_category=True):
        sp.add_argument("--account", type=int, required=True)
        sp.add_argument("--title", required=True)
        sp.add_argument("--amount", required=True)
        if with_category:
            sp.add_argument("--category", type=int, required=True)
        sp.add_argument("--date", default=None)
        sp.add_argument("--note", default=None)

    p = txn_sub.add_parser("expense"); _common(p); p.set_defaults(func=cmd_transaction_expense)
    p = txn_sub.add_parser("income"); _common(p); p.set_defaults(func=cmd_transaction_income)

    p = txn_sub.add_parser("refund")
    p.add_argument("--for", dest="for_entry", type=int, required=True)
    p.add_argument("--amount", required=True)
    p.add_argument("--account", type=int, default=None)
    p.add_argument("--category", type=int, default=None)
    p.add_argument("--title", default=None)
    p.add_argument("--date", default=None)
    p.add_argument("--note", default=None)
    p.set_defaults(func=cmd_transaction_refund)

    p = txn_sub.add_parser("adjustment")
    p.add_argument("--account", type=int, required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--amount", required=True)
    p.add_argument("--side", required=True, choices=["DEBIT", "CREDIT"])
    p.add_argument("--date", default=None)
    p.add_argument("--note", default=None)
    p.set_defaults(func=cmd_transaction_adjustment)

    p = txn_sub.add_parser("edit", help="Edit a simple transaction (mode-adaptive: STRICT "
                                          "reverses+recreates, DIRECT mutates in place).")
    p.add_argument("entry_id", type=int)
    p.add_argument("--account", type=int, default=None)
    p.add_argument("--category", type=int, default=None)
    p.add_argument("--amount", default=None)
    p.add_argument("--title", default=None)
    p.add_argument("--date", default=None)
    p.add_argument("--note", default=None)
    p.set_defaults(func=cmd_transaction_edit)

    p = txn_sub.add_parser("delete"); p.add_argument("entry_id", type=int); p.set_defaults(func=cmd_transaction_delete)
    p = txn_sub.add_parser("show"); p.add_argument("entry_id", type=int); p.set_defaults(func=cmd_transaction_show)
    p = txn_sub.add_parser("list")
    p.add_argument("--account", type=int, default=None)
    p.add_argument("--category", type=int, default=None)
    p.add_argument("--include-reversed", action="store_true")
    p.add_argument("--date-from", default=None)
    p.add_argument("--date-to", default=None)
    p.set_defaults(func=cmd_transaction_list)

    split = sub.add_parser("split", help="Split expenses with friends.")
    split_sub = split.add_subparsers(dest="subcommand", required=True)
    p = split_sub.add_parser("create")
    p.add_argument("--account", type=int, required=True)
    p.add_argument("--category", type=int, required=True)
    p.add_argument("--shares", required=True,
                    help="'owner_share,friend_id:amount,...' -- first value is always your "
                         "own share (can be 0), e.g. '0,2:200,3:200'")
    p.add_argument("--title", required=True)
    p.add_argument("--date", default=None)
    p.add_argument("--note", default=None)
    p.set_defaults(func=cmd_split_create)

    p = split_sub.add_parser("fronted", help="A friend paid for this entirely.")
    p.add_argument("--category", type=int, required=True)
    p.add_argument("--friend", type=int, required=True)
    p.add_argument("--amount", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--date", default=None)
    p.add_argument("--note", default=None)
    p.set_defaults(func=cmd_split_fronted)

    p = split_sub.add_parser("edit", help="Freely edit a SPLIT or FRONTED entry (auto-detected). "
                                            "Mode-adaptive, like 'transaction edit'.")
    p.add_argument("entry_id", type=int)
    p.add_argument("--account", type=int, default=None, help="SPLIT only.")
    p.add_argument("--category", type=int, default=None)
    p.add_argument("--shares", default=None,
                    help="SPLIT only: 'owner_share,friend_id:amount,...' -- omit to keep unchanged")
    p.add_argument("--friend", type=int, default=None, help="FRONTED only: change who fronted it.")
    p.add_argument("--amount", default=None, help="FRONTED only.")
    p.add_argument("--title", default=None)
    p.add_argument("--date", default=None)
    p.add_argument("--note", default=None)
    p.add_argument("--force", action="store_true",
                    help="Proceed even if a participant has existing settlement history.")
    p.add_argument("--remove-settlements", action="store_true",
                    help="Also remove affected participants' settlement history before editing.")
    p.set_defaults(func=cmd_split_edit)

    p = split_sub.add_parser("delete")
    p.add_argument("entry_id", type=int)
    p.add_argument("--force", action="store_true")
    p.add_argument("--remove-settlements", action="store_true")
    p.set_defaults(func=cmd_split_delete)

    p = split_sub.add_parser("show"); p.add_argument("entry_id", type=int); p.set_defaults(func=cmd_split_show)

    p = split_sub.add_parser("list")
    p.add_argument("--type", choices=["SPLIT", "FRONTED"], default=None)
    p.set_defaults(func=cmd_split_list)

    transfer = sub.add_parser("transfer", help="Move money between your own accounts.")
    transfer_sub = transfer.add_subparsers(dest="subcommand", required=True)
    p = transfer_sub.add_parser("create")
    p.add_argument("--from", dest="from_account", type=int, required=True)
    p.add_argument("--to", dest="to_account", type=int, required=True)
    p.add_argument("--amount", required=True)
    p.add_argument("--description", default=None)
    p.add_argument("--date", default=None)
    p.set_defaults(func=cmd_transfer_create)
    p = transfer_sub.add_parser("list"); p.set_defaults(func=cmd_transfer_list)
    p = transfer_sub.add_parser("edit")
    p.add_argument("entry_id", type=int)
    p.add_argument("--from", dest="from_account", type=int, default=None)
    p.add_argument("--to", dest="to_account", type=int, default=None)
    p.add_argument("--amount", default=None)
    p.add_argument("--description", default=None)
    p.add_argument("--date", default=None)
    p.set_defaults(func=cmd_transfer_edit)
    p = transfer_sub.add_parser("delete"); p.add_argument("entry_id", type=int); p.set_defaults(func=cmd_transfer_delete)

    settlement = sub.add_parser("settlement", help="Record a friend paying you back.")
    settlement_sub = settlement.add_subparsers(dest="subcommand", required=True)
    p = settlement_sub.add_parser("create")
    p.add_argument("--friend", type=int, required=True)
    p.add_argument("--account", type=int, required=True)
    p.add_argument("--amount", required=True)
    p.add_argument("--description", default=None)
    p.add_argument("--date", default=None)
    p.add_argument("--note", default=None)
    p.set_defaults(func=cmd_settlement_create)

    p = settlement_sub.add_parser("edit")
    p.add_argument("entry_id", type=int)
    p.add_argument("--friend", type=int, default=None)
    p.add_argument("--account", type=int, default=None)
    p.add_argument("--amount", default=None)
    p.add_argument("--description", default=None)
    p.add_argument("--date", default=None)
    p.add_argument("--note", default=None)
    p.set_defaults(func=cmd_settlement_edit)

    p = settlement_sub.add_parser("delete")
    p.add_argument("entry_id", type=int)
    p.set_defaults(func=cmd_settlement_delete)

    p = settlement_sub.add_parser("list"); p.add_argument("--friend", type=int, default=None); p.set_defaults(func=cmd_settlement_list)

    report = sub.add_parser("report", help="Read-only reports.")
    report_sub = report.add_subparsers(dest="subcommand", required=True)
    p = report_sub.add_parser("balance"); p.add_argument("--all", action="store_true"); p.set_defaults(func=cmd_report_balance)
    p = report_sub.add_parser("budget"); p.add_argument("--month", default=None); p.set_defaults(func=cmd_report_budget)
    p = report_sub.add_parser("friends"); p.set_defaults(func=cmd_report_friends)
    p = report_sub.add_parser("statement"); p.add_argument("--friend", type=int, required=True); p.set_defaults(func=cmd_report_statement)
    p = report_sub.add_parser("net-worth"); p.set_defaults(func=cmd_report_net_worth)
    p = report_sub.add_parser("spending"); p.add_argument("--month", default=None); p.set_defaults(func=cmd_report_spending)
    p = report_sub.add_parser("income"); p.add_argument("--month", default=None); p.set_defaults(func=cmd_report_income)
    p = report_sub.add_parser("dashboard"); p.add_argument("--month", default=None); p.set_defaults(func=cmd_report_dashboard)

    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    conn = db.connect(args.db_path)
    try:
        args.func(args, conn)
        conn.commit()
        return 0
    except (DomainError, MoneyError, ValueError, sqlite3.IntegrityError) as exc:
        conn.rollback()
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
