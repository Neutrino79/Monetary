import pytest

from duevia.application import ledger_service as ls
from duevia.application.posting_strategies import simple, transfer
from duevia.domain.exceptions import ConflictError, NotFoundError
from duevia.domain.money import Money
from duevia.infrastructure import repositories as repo

D = "2026-01-01T00:00:00+00:00"


def post_expense(ctx, amount=500, acct="bank", cat="food"):
    return ls.post(ctx.conn, simple.build_expense(
        real_account_id=ctx.acct[acct], expense_account_id=ctx.cat[cat],
        amount=Money(amount, "INR"), description="Lunch", entry_date=D))


def test_post_persists_entry_and_balanced_postings(ctx):
    e = post_expense(ctx)
    assert e["status"] == "POSTED" and e["entry_type"] == "NORMAL" and e["category_id"] == ctx.cat["food"]
    posts = repo.postings_for_entry(ctx.conn, e["id"])
    assert sum(p["debit_amount"] for p in posts) == sum(p["credit_amount"] for p in posts) == 500
    assert ctx.bal("bank") == -500


def test_legs_roundtrip(ctx):
    e = post_expense(ctx, 700)
    legs = ls.legs_for_entry(ctx.conn, e["id"])
    assert {(l.account_id, l.side.value, l.amount.points) for l in legs} == {
        (ctx.acct["bank"], "CREDIT", 700), (ctx.cat["food"], "DEBIT", 700)}


def test_reverse_mirrors_and_links(ctx):
    e = post_expense(ctx)
    rev = ls.reverse(ctx.conn, e["id"])
    assert rev["entry_type"] == "REVERSAL" and rev["reversal_of_id"] == e["id"]
    orig = repo.get_journal_entry(ctx.conn, e["id"])
    assert orig["status"] == "REVERSED" and orig["reversed_by_id"] == rev["id"]
    assert ls.mirror_legs(ls.legs_for_entry(ctx.conn, e["id"])) == ls.legs_for_entry(ctx.conn, rev["id"])


def test_reversed_entry_still_counts_in_raw_balance_but_nets_to_zero(ctx):
    e = post_expense(ctx)
    ls.reverse(ctx.conn, e["id"])
    assert ctx.bal("bank") == 0   # original + reversal cancel out


def test_double_reverse_is_a_conflict(ctx):
    e = post_expense(ctx)
    ls.reverse(ctx.conn, e["id"])
    with pytest.raises(ConflictError):
        ls.reverse(ctx.conn, e["id"])


def test_reverse_unknown_entry(ctx):
    with pytest.raises(NotFoundError):
        ls.reverse(ctx.conn, 999)


def test_transfer_moves_between_real_accounts(ctx):
    ls.post(ctx.conn, transfer.build_transfer(from_account_id=ctx.acct["bank"], to_account_id=ctx.acct["wallet"],
                                              amount=Money(300, "INR"), description="t", entry_date=D))
    assert (ctx.bal("bank"), ctx.bal("wallet")) == (-300, 300)
