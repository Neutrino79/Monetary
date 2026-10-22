"""Command/query layer behind the flat `/transactions` API.

Speaks the web app's vocabulary (one transaction = one row with a `type`) and
dispatches to the existing, unchanged type-specific services -- the
double-entry core, posting strategies and edit policies are reused as-is. This
module owns only translation and cross-field validation, never ledger rules.
"""

from __future__ import annotations

from monetary.application import (
    settlement_service,
    split_service,
    transaction_service,
    transfer_service,
)
from monetary.application.transaction_view import to_views
from monetary.domain.enums import AccountType
from monetary.domain.exceptions import NotFoundError, ValidationError
from monetary.domain.money import Money
from monetary.domain.time_utils import (
    local_today,
    next_local_day_start_utc_iso,
    parse_local_to_utc_iso,
)
from monetary.infrastructure import repositories as repo
from monetary.infrastructure import transaction_queries as q

FLAT_TYPES = ("income", "expense", "transfer", "split", "fronted", "settlement", "refund", "adjustment")
SORT_FIELDS = ("date", "amount", "description")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _need(data: dict, kind: str, *keys: str) -> None:
    missing = [k for k in keys if data.get(k) in (None, "")]
    if missing:
        names = ", ".join(_camel(k) for k in missing)
        raise ValidationError(f"{names} {'is' if len(missing) == 1 else 'are'} required for a {kind} transaction.")


def _camel(key: str) -> str:
    head, *rest = key.split("_")
    return head + "".join(p.title() for p in rest)


def _clean_memo(memo: str | None) -> str | None:
    memo = (memo or "").strip()
    return memo or None


def _check_date(date_str: str | None, owner: dict) -> None:
    """Future-dated entries are rejected (the owner's local 'today' is the limit)."""
    if date_str and date_str.strip()[:10] > local_today(owner["timezone"]):
        raise ValidationError("Date cannot be in the future.")


def _money(value: str, currency: str, *, allow_zero=False) -> Money:
    return Money.from_major_units(value, currency, allow_zero=allow_zero)


def _validated_split(currency: str, total: str, your_share: str | None, shares: list[dict]) -> list[tuple[int, str]]:
    """Total = your share + friend shares, checked exactly in minor units.
    Returns [(friend_id, share_major)] ready for the split service."""
    if not shares:
        raise ValidationError("At least one friend share is required for a split.")
    total_m = _money(total, currency)
    own = _money(your_share or "0", currency, allow_zero=True)
    parts = [(s["friend_id"], s["share"]) for s in shares]
    summed = own.points + sum(_money(share, currency).points for _, share in parts)
    if summed != total_m.points:
        raise ValidationError(
            f"Shares must add up to the total: your share + friend shares is {Money(summed, currency)} "
            f"but the total is {total_m}.")
    return parts


def _adjustment_side(account_type: str, direction: str) -> str:
    if direction not in ("increase", "decrease"):
        raise ValidationError("direction must be 'increase' or 'decrease' for an adjustment.")
    raises_balance_with_debit = account_type == AccountType.ASSET.value
    debit = (direction == "increase") == raises_balance_with_debit
    return "DEBIT" if debit else "CREDIT"


# --------------------------------------------------------------------------- #
# create
# --------------------------------------------------------------------------- #
def create(conn, owner: dict, data: dict) -> dict:
    ftype = data["type"]
    if ftype not in FLAT_TYPES:
        raise ValidationError(f"Unknown transaction type {ftype!r}; expected one of: {', '.join(FLAT_TYPES)}.")
    description = (data["description"] or "").strip()
    date_str = data.get("date")
    _check_date(date_str, owner)
    memo = _clean_memo(data.get("memo"))
    amount = data.get("amount")
    _need(data, ftype, "amount")

    if ftype in ("expense", "income"):
        _need(data, ftype, "account_id", "category_id")
        record = transaction_service.record_expense if ftype == "expense" else transaction_service.record_income
        return record(conn, owner, account_id=data["account_id"], category_id=data["category_id"],
                      amount_major=amount, description=description, date_str=date_str, note=memo)

    if ftype == "transfer":
        _need(data, ftype, "account_id", "to_account_id")
        return transfer_service.create_transfer(
            conn, owner, from_account_id=data["account_id"], to_account_id=data["to_account_id"],
            amount_major=amount, description=description, date_str=date_str, note=memo)

    if ftype == "split":
        _need(data, ftype, "account_id", "category_id")
        account = transaction_service._require_real_account(conn, data["account_id"])
        parts = _validated_split(account["currency_code"], amount, data.get("your_share"), data.get("splits") or [])
        return split_service.create_split_expense(
            conn, owner, account_id=data["account_id"], category_id=data["category_id"],
            owner_share_major=data.get("your_share") or "0", friend_shares=parts,
            description=description, date_str=date_str, note=memo)

    if ftype == "fronted":
        _need(data, ftype, "category_id", "friend_id")
        return split_service.create_friend_fronted_expense(
            conn, owner, category_id=data["category_id"], friend_id=data["friend_id"],
            amount_major=amount, description=description, date_str=date_str, note=memo)

    if ftype == "settlement":
        _need(data, ftype, "friend_id", "account_id")
        entry = settlement_service.create_settlement(
            conn, owner, friend_id=data["friend_id"], account_id=data["account_id"],
            amount_major=amount, description=description or None, date_str=date_str, note=memo)
        requested = data.get("direction")
        if requested:
            actual = to_views(conn, owner, [entry])[0]["direction"]
            if actual != requested:
                # raising rolls back the whole request, so nothing is posted
                raise ValidationError(
                    f"Your balance with this friend makes this a settlement you {actual}, "
                    f"not one you {requested}.")
        return entry

    if ftype == "refund":
        _need(data, ftype, "refund_of_id")
        return transaction_service.record_refund(
            conn, owner, for_entry_id=data["refund_of_id"], amount_major=amount,
            account_id=data.get("account_id"), category_id=data.get("category_id"),
            description=description or None, date_str=date_str, note=memo)

    # adjustment
    _need(data, ftype, "account_id", "direction")
    account = transaction_service._require_real_account(conn, data["account_id"])
    return transaction_service.record_adjustment(
        conn, owner, account_id=data["account_id"], amount_major=amount,
        side=_adjustment_side(account["account_type"], data["direction"]),
        description=description, date_str=date_str, note=memo)


# --------------------------------------------------------------------------- #
# read
# --------------------------------------------------------------------------- #
def _entry_or_404(conn, entry_id: int) -> dict:
    entry = repo.get_journal_entry(conn, entry_id)
    if entry is None or entry["entry_type"] == "REVERSAL":
        raise NotFoundError(f"Transaction {entry_id} not found.")
    return entry


def get_view(conn, owner: dict, entry_id: int) -> dict:
    return to_views(conn, owner, [_entry_or_404(conn, entry_id)])[0]


def view_of(conn, owner: dict, entry: dict) -> dict:
    return to_views(conn, owner, [entry])[0]


def list_views(conn, owner: dict, *, account_id=None, category_id=None, friend_id=None, refund_of_id=None, types=None,
               search=None, status="posted", date_from=None, date_to=None, sort="date",
               direction="desc", limit=50, offset=0, group_by=None) -> tuple[list[dict], int]:
    """With `group_by`, rows are clustered by group and each view carries `group_key`."""
    filters = _filters(conn, owner, account_id=account_id, category_id=category_id, friend_id=friend_id,
                       refund_of_id=refund_of_id, types=types, search=search, status=status,
                       date_from=date_from, date_to=date_to)
    if sort not in SORT_FIELDS:
        raise ValidationError(f"sort must be one of: {', '.join(SORT_FIELDS)}.")
    _check_group_by(group_by)
    rows, total = q.search_entries(conn, **filters, sort=sort, direction=direction, limit=limit, offset=offset,
                                   group_by=group_by, tz_name=owner["timezone"])
    views = to_views(conn, owner, rows)
    if group_by:
        for view, row in zip(views, rows):          # to_views keeps the order of `rows`
            view["group_key"] = row["group_key"]
    return views, total


def group_summaries(conn, owner: dict, *, group_by, direction="desc", account_id=None, category_id=None,
                    friend_id=None, refund_of_id=None, types=None, search=None, status="posted",
                    date_from=None, date_to=None) -> list[dict]:
    """Header data for each group of a grouped list: key, label, count, money in and out (in points)."""
    _check_group_by(group_by)
    if not group_by:
        raise ValidationError(f"groupBy is required; expected one of: {', '.join(q.GROUP_BYS)}.")
    filters = _filters(conn, owner, account_id=account_id, category_id=category_id, friend_id=friend_id,
                       refund_of_id=refund_of_id, types=types, search=search, status=status,
                       date_from=date_from, date_to=date_to)
    groups: dict[str, dict] = {}
    for r in q.group_summary(conn, group_by=group_by, tz_name=owner["timezone"], direction=direction, **filters):
        g = groups.setdefault(r["group_key"], {"key": r["group_key"], "label": r["group_label"], "count": 0, "totals": []})
        g["count"] += r["n"]
        g["totals"].append({"currency": r["currency"], "in_points": r["in_points"], "out_points": r["out_points"]})
    return list(groups.values())


def _check_group_by(group_by) -> None:
    if group_by is not None and group_by not in q.GROUP_BYS:
        raise ValidationError(f"groupBy must be one of: {', '.join(q.GROUP_BYS)}.")


def _filters(conn, owner: dict, *, account_id, category_id, friend_id, refund_of_id, types, search, status,
             date_from, date_to) -> dict:
    """The filter arguments shared by the list and the group summary, translated for the query layer."""
    for t in types or []:
        if t not in FLAT_TYPES:
            raise ValidationError(f"Unknown transaction type {t!r}; expected one of: {', '.join(FLAT_TYPES)}.")
    tz = owner["timezone"]
    category_ids = None
    if category_id is not None:
        # a parent category includes its subcategories, like every report does
        category_ids = [category_id, *repo.child_account_ids(conn, category_id)]
    return dict(
        account_id=account_id, category_ids=category_ids, friend_id=friend_id, refund_of_id=refund_of_id,
        flat_types=types or None, search=search, status=status,
        date_from=parse_local_to_utc_iso(date_from, tz) if date_from else None,
        date_to_exclusive=next_local_day_start_utc_iso(date_to, tz) if date_to else None)


# --------------------------------------------------------------------------- #
# update / delete
# --------------------------------------------------------------------------- #
def update(conn, owner: dict, entry_id: int, fields: dict, *, force=False, remove_settlements=False) -> dict:
    """`fields` holds only the keys the client sent. A key present with null
    clears the field where clearing is meaningful (memo); absent = unchanged."""
    entry = _entry_or_404(conn, entry_id)
    etype = entry["entry_type"]
    if "date" in fields and fields["date"]:
        _check_date(fields["date"], owner)
    description = fields["description"].strip() if fields.get("description") else None
    date_str = fields.get("date") or None
    amount = fields.get("amount") or None
    note = None
    if "memo" in fields:
        note = _clean_memo(fields["memo"]) or ""        # "" clears; None would mean "unchanged"

    if etype in ("NORMAL", "REFUND", "ADJUSTMENT"):
        if etype == "ADJUSTMENT" and fields.get("direction"):
            current = view_of(conn, owner, entry)["direction"]
            if fields["direction"] != current:
                raise ValidationError("An adjustment's direction can't be changed; delete it and create a new one.")
        if "category_id" in fields and fields["category_id"] is None and etype == "NORMAL":
            raise ValidationError("categoryId can't be cleared on an expense or income.")
        return transaction_service.edit_expense_or_income(
            conn, owner, entry_id, account_id=fields.get("account_id"), category_id=fields.get("category_id"),
            amount_major=amount, description=description, date_str=date_str, note=note)

    if etype == "TRANSFER":
        return transfer_service.edit_transfer(
            conn, owner, entry_id, from_account_id=fields.get("account_id"),
            to_account_id=fields.get("to_account_id"), amount_major=amount,
            description=description, date_str=date_str, note=note)

    if etype == "SETTLEMENT":
        return settlement_service.edit_settlement(
            conn, owner, entry_id, friend_id=fields.get("friend_id"), account_id=fields.get("account_id"),
            amount_major=amount, description=description, date_str=date_str, note=note)

    if etype == "SPLIT":
        current = view_of(conn, owner, entry)
        owner_share = friend_shares = None
        if any(k in fields for k in ("amount", "your_share", "splits")):
            account_id = fields.get("account_id") or current["account_id"]
            currency = repo.get_account(conn, account_id)["currency_code"]
            total = Money(current["amount_points"], currency).to_major_units_str()
            your = Money(current["your_share_points"] or 0, currency).to_major_units_str()
            shares = [{"friend_id": f, "share": Money(p, currency).to_major_units_str()}
                      for f, p in current["splits"] or []]
            friend_shares = _validated_split(
                currency, amount or total, fields["your_share"] if "your_share" in fields else your,
                fields["splits"] if fields.get("splits") is not None else shares)
            owner_share = fields["your_share"] if "your_share" in fields and fields["your_share"] else (
                "0" if "your_share" in fields else your)
        return split_service.edit(
            conn, owner, entry_id, account_id=fields.get("account_id"), category_id=fields.get("category_id"),
            owner_share_major=owner_share, friend_shares=friend_shares, description=description,
            date_str=date_str, note=note, force=force, remove_settlements=remove_settlements)

    if etype == "FRONTED":
        return split_service.edit(
            conn, owner, entry_id, category_id=fields.get("category_id"), friend_id=fields.get("friend_id"),
            amount_major=amount, description=description, date_str=date_str, note=note,
            force=force, remove_settlements=remove_settlements)

    raise ValidationError(f"Transactions of type {etype} can't be edited.")


def delete(conn, owner: dict, entry_id: int, *, force=False, remove_settlements=False) -> None:
    entry = _entry_or_404(conn, entry_id)
    etype = entry["entry_type"]
    if etype in ("NORMAL", "REFUND", "ADJUSTMENT"):
        transaction_service.delete_entry(conn, owner, entry_id)
    elif etype == "TRANSFER":
        transfer_service.delete_transfer(conn, owner, entry_id)
    elif etype in ("SPLIT", "FRONTED"):
        split_service.delete_split(conn, owner, entry_id, force=force, remove_settlements=remove_settlements)
    elif etype == "SETTLEMENT":
        settlement_service.delete_settlement(conn, owner, entry_id)
    else:
        raise ValidationError(f"Transactions of type {etype} can't be deleted.")
