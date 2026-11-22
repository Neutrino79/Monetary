"""Operator command line: ``python -m monetary.cli <command>``.

Works directly on the data directory (``MONETARY_DATA_DIR``), so it is how the first superuser is
created on a server without opening the web setup page, and the way back in if every superuser is
locked out. Passwords are read from a prompt, from ``--password-stdin`` or from the
``MONETARY_PASSWORD`` environment variable -- never from a command-line argument, which other users
of the machine could see.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from typing import Sequence

from monetary.application import admin_service, identity_service, operations, provisioning
from monetary.config import data_dir_from_environment
from monetary.domain.enums import OPERATOR_ROLE
from monetary.domain.exceptions import DomainError
from monetary.infrastructure import control_db, control_repository as crepo
from monetary.infrastructure import db, migrations

OPERATOR = {"id": None, "role": OPERATOR_ROLE}  # whoever can run this on the server


def _read_password(args: argparse.Namespace) -> str:
    if args.password_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    from_env = os.environ.get("MONETARY_PASSWORD")
    if from_env:
        return from_env
    first = getpass.getpass("Password: ")
    if getpass.getpass("Repeat password: ") != first:
        raise SystemExit("error: the passwords do not match")
    return first


def _cmd_create_superuser(control, data_dir, args) -> int:
    user = identity_service.create_superuser(
        control, name=args.name, email=args.email, password=_read_password(args),
        timezone=args.timezone, home_currency_code=args.currency)
    if not args.no_ledger:
        provisioning.provision_ledger(control, data_dir, user["id"])
    print(f"Created superuser {user['email']} (id {user['id']}).")
    return 0


def _cmd_list_users(control, data_dir, args) -> int:
    users, total = admin_service.list_users(control, status=args.status, limit=200)
    for u in users:
        print(f"{u['id']:>4}  {u['status']:<16} {u['role']:<10} {u['email']}")
    print(f"{total} user(s)")
    return 0


def _cmd_reset_password(control, data_dir, args) -> int:
    user = crepo.get_user_by_email(control, args.email)
    if user is None:
        print(f"error: no account with email {args.email}", file=sys.stderr)
        return 1
    _, temp = admin_service.reset_password(control, OPERATOR, user["id"])
    print(f"Temporary password for {user['email']}: {temp}")
    print("It must be changed at the next sign-in. Shown once.")
    return 0


def _cmd_transfer_superuser(control, data_dir, args) -> int:
    user = identity_service.transfer_superuser(control, to_email=args.to, demote_to=args.demote_to)
    print(f"{user['email']} is now the superuser. The previous superuser became {args.demote_to}.")
    return 0


def _cmd_unlock(control, data_dir, args) -> int:
    user = crepo.get_user_by_email(control, args.email)
    if user is None:
        print(f"error: no account with email {args.email}", file=sys.stderr)
        return 1
    admin_service.unlock(control, OPERATOR, user["id"])
    print(f"Unlocked {user['email']}.")
    return 0


def _cmd_migrate_all(control, data_dir, args) -> int:
    """Upgrade every ledger now instead of lazily at each user's next request."""
    count = 0
    for user in crepo.list_users(control, limit=100000):
        ledger = provisioning.open_ledger(control, data_dir, user["id"])
        if ledger is None:
            continue
        version = migrations.current_version(ledger)
        ledger.close()
        count += 1
        print(f"{user['email']}: schema version {version}")
    print(f"{count} ledger(s) are up to date (latest version {migrations.latest_version(db.TENANT_MIGRATIONS)}).")
    return 0


def _cmd_purge(control, data_dir, args) -> int:
    """Housekeeping: finish deletions whose 30-day grace is over, drop stale sign-up requests and
    leftover files. Safe to run daily (cron or a systemd timer)."""
    stale = identity_service.purge_stale_requests(control)
    result = operations.purge_due_accounts(control, data_dir)
    if args.dry_run:
        control.rollback()
        print(f"Would purge {len(result.purged_emails)} account(s): {', '.join(result.purged_emails) or '-'}")
        print(f"Would remove {len(result.files_to_delete)} ledger file(s) and {stale} stale request(s).")
        return 0
    control.commit()  # forget the accounts first; only then delete their files
    removed = operations.delete_files(result.files_to_delete)
    orphans = operations.remove_orphan_files(control, data_dir)
    print(f"Purged {len(result.purged_emails)} account(s), removed {removed} ledger file(s), "
          f"{stale} stale request(s) and {len(orphans)} orphan file(s).")
    for kept in result.kept_files:
        print(f"Kept adopted ledger file outside the data directory (delete it by hand if intended): {kept}")
    return 0


def _cmd_backup(control, data_dir, args) -> int:
    summary = operations.backup_all(control, data_dir, args.to)
    print(f"Backed up the control database and {summary['ledgers']} ledger(s) to {summary['destination']}.")
    print("Restore by copying control.db and tenants/ into an empty data directory.")
    return 0


def _cmd_usage(control, data_dir, args) -> int:
    u = operations.usage(control, data_dir)
    print(f"{u['ledger_count']} ledger(s), {u['ledger_bytes'] / 1024 / 1024:.2f} MiB on disk")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m monetary.cli", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-superuser", help="create an active superuser (and their ledger)")
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--currency", default="INR", help="home currency code (default INR)")
    p.add_argument("--timezone", default=None)
    p.add_argument("--no-ledger", action="store_true", help="administration only: do not create a ledger")
    p.add_argument("--password-stdin", action="store_true", help="read the password from standard input")
    p.set_defaults(func=_cmd_create_superuser)

    p = sub.add_parser("list-users", help="list accounts")
    p.add_argument("--status", default=None)
    p.set_defaults(func=_cmd_list_users)

    p = sub.add_parser("reset-password", help="issue a temporary password for an account")
    p.add_argument("--email", required=True)
    p.set_defaults(func=_cmd_reset_password)

    p = sub.add_parser("transfer-superuser", help="hand the single superuser role to another active account")
    p.add_argument("--to", required=True, help="email of the account that becomes the superuser")
    p.add_argument("--demote-to", choices=("admin", "user"), default="admin",
                   help="role the previous superuser gets (default: admin)")
    p.set_defaults(func=_cmd_transfer_superuser)

    p = sub.add_parser("unlock", help="lift a sign-in lock (too many wrong passwords) on an account")
    p.add_argument("--email", required=True)
    p.set_defaults(func=_cmd_unlock)

    p = sub.add_parser("purge", help="finish due deletions and clear stale requests and leftover files")
    p.add_argument("--dry-run", action="store_true", help="show what would happen and change nothing")
    p.set_defaults(func=_cmd_purge)

    p = sub.add_parser("backup", help="copy the control database and every ledger to a folder")
    p.add_argument("--to", required=True, help="destination folder (created if needed)")
    p.set_defaults(func=_cmd_backup)

    p = sub.add_parser("usage", help="how many ledgers exist and how much disk they use")
    p.set_defaults(func=_cmd_usage)

    p = sub.add_parser("migrate-all", help="upgrade every ledger database to the latest schema")
    p.set_defaults(func=_cmd_migrate_all)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    data_dir = data_dir_from_environment()
    control = control_db.connect_control(data_dir)
    try:
        code = args.func(control, data_dir, args)
        control.commit()
        return code
    except DomainError as exc:
        control.rollback()
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        control.close()


if __name__ == "__main__":
    raise SystemExit(main())
