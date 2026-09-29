from duevia.application import ledger_service as ls
from duevia.application.posting_strategies import refund, simple
from duevia.domain.money import Money
from duevia.infrastructure import repositories as repo

D = "2026-03-15T00:00:00+00:00"


def m(p):
    return Money(p, "INR")


def post(ctx, amount, date=D):
    return ls.post(ctx.conn, simple.build_expense(
        real_account_id=ctx.acct["bank"], expense_account_id=ctx.cat["food"], amount=m(amount),
        description="x", entry_date=date))


def test_balance_as_of_is_strictly_before(ctx):
    post(ctx, 100)
    assert repo.account_balance_points_as_of(ctx.conn, ctx.acct["bank"], "CREDIT", D) == 0
    assert repo.account_balance_points_as_of(ctx.conn, ctx.acct["bank"], "CREDIT", "2026-03-16T00:00:00+00:00") == 100


def test_period_sums_exclude_reversed_entries(ctx):
    a, b = post(ctx, 100), post(ctx, 250)
    ls.reverse(ctx.conn, a["id"])
    d, c = repo.account_period_debit_credit(ctx.conn, [ctx.cat["food"]], "2026-03-01T00:00:00+00:00",
                                            "2026-04-01T00:00:00+00:00")
    assert (d, c) == (250, 0)


def test_period_bounds_are_half_open(ctx):
    post(ctx, 100, "2026-03-01T00:00:00+00:00")
    post(ctx, 200, "2026-04-01T00:00:00+00:00")
    d, _ = repo.account_period_debit_credit(ctx.conn, [ctx.cat["food"]], "2026-03-01T00:00:00+00:00",
                                            "2026-04-01T00:00:00+00:00")
    assert d == 100


def test_refund_totals_and_counts(ctx):
    e = post(ctx, 1000)
    for amt in (300, 200):
        ls.post(ctx.conn, refund.build_refund(real_account_id=ctx.acct["bank"], expense_account_id=ctx.cat["food"],
                                              amount=m(amt), description="r", entry_date=D, refund_of_id=e["id"]))
    assert repo.refunded_total_points(ctx.conn, e["id"]) == 500
    assert repo.posted_refund_count(ctx.conn, e["id"]) == 2
    assert repo.posted_refund_count(ctx.conn, 12345) == 0


def test_list_and_count_agree_under_filters(ctx):
    post(ctx, 100); post(ctx, 200)
    kw = dict(account_id=ctx.acct["bank"], search="x")
    assert len(repo.list_journal_entries(ctx.conn, **kw)) == repo.count_journal_entries(ctx.conn, **kw) == 2
    assert len(repo.list_journal_entries(ctx.conn, limit=1, offset=1, **kw)) == 1


def test_db_constraints_reject_bad_postings(ctx):
    import sqlite3
    import pytest
    e = post(ctx, 100)
    for d, c in ((0, 0), (5, 5), (-1, 0)):
        with pytest.raises(sqlite3.IntegrityError):
            repo.create_posting(ctx.conn, journal_entry_id=e["id"], account_id=ctx.acct["bank"],
                                debit_amount=d, credit_amount=c, now=D)


def test_foreign_keys_are_enforced(ctx):
    import sqlite3
    import pytest
    with pytest.raises(sqlite3.IntegrityError):
        repo.create_posting(ctx.conn, journal_entry_id=99999, account_id=ctx.acct["bank"],
                            debit_amount=1, credit_amount=0, now=D)
