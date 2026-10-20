import pytest

from monetary.application import ledger_service as ls
from monetary.application.edit_policies import get_edit_policy
from monetary.application.posting_strategies import simple, split
from monetary.domain.money import Money
from monetary.infrastructure import repositories as repo

D = "2026-01-01T00:00:00+00:00"


def m(p):
    return Money(p, "INR")


def expense(ctx, amount=500):
    return ls.post(ctx.conn, simple.build_expense(
        real_account_id=ctx.acct["bank"], expense_account_id=ctx.cat["food"], amount=m(amount),
        description="Lunch", entry_date=D))


def test_unknown_mode_rejected():
    with pytest.raises(ValueError):
        get_edit_policy("NOPE")


def test_direct_correct_changes_amount_in_place(ctx):
    e = expense(ctx)
    new = simple.build_expense(real_account_id=ctx.acct["bank"], expense_account_id=ctx.cat["food"],
                               amount=m(900), description="Big lunch", entry_date=D)
    out = get_edit_policy("DIRECT").correct(ctx.conn, e["id"], new)
    assert out["id"] == e["id"] and out["description"] == "Big lunch" and out["status"] == "POSTED"
    assert ctx.bal("bank") == -900
    assert len(repo.postings_for_entry(ctx.conn, e["id"])) == 2   # reconciled, not duplicated


def test_direct_correct_can_swap_accounts_and_change_leg_count(ctx):
    sp = ls.post(ctx.conn, split.build_split_expense(
        real_account_id=ctx.acct["bank"], expense_account_id=ctx.cat["food"], owner_share=m(100),
        friend_shares=[(ctx.due("rahul"), m(200))], description="S", entry_date=D))
    new = split.build_split_expense(
        real_account_id=ctx.acct["wallet"], expense_account_id=ctx.cat["food"], owner_share=m(100),
        friend_shares=[(ctx.due("priya"), m(50)), (ctx.due("rahul"), m(50))], description="S", entry_date=D)
    get_edit_policy("DIRECT").correct(ctx.conn, sp["id"], new)
    assert (ctx.bal("bank"), ctx.bal("wallet")) == (0, -200)
    posts = repo.postings_for_entry(ctx.conn, sp["id"])
    assert len(posts) == 4 and sum(p["debit_amount"] for p in posts) == sum(p["credit_amount"] for p in posts)


def test_direct_delete_removes_entry_and_postings(ctx):
    e = expense(ctx)
    get_edit_policy("DIRECT").delete(ctx.conn, e["id"])
    assert repo.get_journal_entry(ctx.conn, e["id"]) is None
    assert repo.postings_for_entry(ctx.conn, e["id"]) == [] and ctx.bal("bank") == 0


def test_strict_correct_reverses_then_posts_replacement(ctx):
    e = expense(ctx)
    new = simple.build_expense(real_account_id=ctx.acct["bank"], expense_account_id=ctx.cat["food"],
                               amount=m(900), description="Big lunch", entry_date=D)
    out = get_edit_policy("STRICT").correct(ctx.conn, e["id"], new)
    assert out["id"] != e["id"] and out["status"] == "POSTED"
    assert repo.get_journal_entry(ctx.conn, e["id"])["status"] == "REVERSED"
    assert ctx.bal("bank") == -900


def test_strict_delete_only_reverses(ctx):
    e = expense(ctx)
    get_edit_policy("STRICT").delete(ctx.conn, e["id"])
    assert repo.get_journal_entry(ctx.conn, e["id"])["status"] == "REVERSED" and ctx.bal("bank") == 0
