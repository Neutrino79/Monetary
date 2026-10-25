"""Read model: turns journal entries + postings into the flat, one-row-per-
transaction shape the web app works with.

The double-entry core is untouched -- this only *reads* it. Each entry type has
a fixed leg shape (see posting_strategies/), so the flat fields are derived from
which accounts the postings touch:

  expense / income   real account <-> EXPENSE / INCOME category
  refund             real account <- EXPENSE category (linked to the original)
  split              real account credited the full bill; friends' DUE accounts
                     debited their shares; the owner's own share (maybe 0) is
                     the EXPENSE leg
  fronted            EXPENSE category debited the full amount; the friend's DUE
                     account credited (the friend paid)
  transfer           credit leg = from account, debit leg = to account
  adjustment         real account <-> system EQUITY account
  settlement         real account <-> a friend's DUE account
"""

from __future__ import annotations

from monetary.application import statement_service
from monetary.domain.time_utils import utc_iso_to_local_date
from monetary.infrastructure import tag_repository as tag_repo
from monetary.infrastructure import transaction_queries as q

REAL = ("ASSET", "LIABILITY")


def flat_type(entry: dict, category_type: str | None) -> str:
    if entry["entry_type"] == "NORMAL":
        return "expense" if category_type == "EXPENSE" else "income"
    return entry["entry_type"].lower()


def _amount(p: dict) -> int:
    return p["debit_amount"] or p["credit_amount"]


def _derive(entry: dict, postings: list[dict], category_type: str | None) -> dict:
    ftype = flat_type(entry, category_type)
    real = [p for p in postings if p["account_type"] in REAL]
    dues = [p for p in postings if p["account_type"] == "DUE"]
    headline = max((_amount(p) for p in postings), default=0)

    out = {"type": ftype, "amount_points": headline, "account_id": None, "to_account_id": None,
           "category_id": entry["category_id"], "friend_id": None, "direction": None,
           "your_share_points": None, "splits": None}

    if ftype in ("expense", "income", "refund"):
        out["account_id"] = real[0]["account_id"] if real else None
    elif ftype == "split":
        out["account_id"] = real[0]["account_id"] if real else None
        out["amount_points"] = _amount(real[0]) if real else headline
        owner_leg = [p for p in postings if p["account_type"] == "EXPENSE"]
        out["your_share_points"] = _amount(owner_leg[0]) if owner_leg else 0
        out["splits"] = [(p["counterparty_user_id"], _amount(p)) for p in dues]
    elif ftype == "fronted":
        out["friend_id"] = dues[0]["counterparty_user_id"] if dues else None
    elif ftype == "transfer":
        out["account_id"] = next((p["account_id"] for p in real if p["credit_amount"] > 0), None)
        out["to_account_id"] = next((p["account_id"] for p in real if p["debit_amount"] > 0), None)
    elif ftype == "adjustment" and real:
        p = real[0]
        # "increase" = the account's displayed balance goes up: debit for an asset,
        # credit for a liability (the amount owed grows).
        raises = (p["debit_amount"] > 0) if p["account_type"] == "ASSET" else (p["credit_amount"] > 0)
        out["account_id"] = p["account_id"]
        out["direction"] = "increase" if raises else "decrease"
        out["category_id"] = None
    elif ftype == "settlement" and real and dues:
        out["account_id"] = real[0]["account_id"]
        out["friend_id"] = dues[0]["counterparty_user_id"]
        out["direction"] = "receive" if real[0]["debit_amount"] > 0 else "pay"
        out["category_id"] = None
    if ftype in ("transfer",):
        out["category_id"] = None
    return out


def to_views(conn, owner: dict, entries: list[dict]) -> list[dict]:
    """Batch-build flat views (3 queries total regardless of page size)."""
    ids = [e["id"] for e in entries]
    postings = q.postings_with_accounts(conn, ids)
    replaced_by = q.replacements_for(conn, ids)
    cat_ids = sorted({e["category_id"] for e in entries if e["category_id"] is not None})
    cat_types: dict[int, str] = {}
    if cat_ids:
        rows = conn.execute(
            f"SELECT id, account_type FROM account WHERE id IN ({','.join('?' for _ in cat_ids)})", cat_ids
        ).fetchall()
        cat_types = {r["id"]: r["account_type"] for r in rows}

    unpaid: dict[int, int] = {}
    if any(e["entry_type"] == "FRONTED" for e in entries):
        unpaid = {f["entry_id"]: f["unpaid_points"] for f in statement_service.fronted_unpaid(conn)}

    tags = tag_repo.tags_for_entries(conn, ids)
    tz = owner["timezone"]
    views = []
    for e in entries:
        v = _derive(e, postings.get(e["id"], []), cat_types.get(e["category_id"]))
        v["unpaid_points"] = unpaid.get(e["id"]) if e["entry_type"] == "FRONTED" and e["status"] == "POSTED" else None
        v.update({
            "id": e["id"], "description": e["description"], "memo": e["memo"] or None,
            "date": utc_iso_to_local_date(e["entry_date"], tz), "currency": e["currency_code"],
            "status": e["status"].lower(), "refund_of_id": e["refund_of_id"],
            "correction_of": e["correction_of_id"], "replaced_by": replaced_by.get(e["id"]),
            "created_at": e["created_at"], "updated_at": e["updated_at"], "tags": tags.get(e["id"], []),
        })
        views.append(v)
    return views
