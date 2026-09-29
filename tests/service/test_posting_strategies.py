"""Each strategy must emit a balanced intent with the right sides."""
import pytest

from duevia.application.posting_strategies import refund, settlement, simple, split, transfer
from duevia.domain.enums import EntryType, Side
from duevia.domain.exceptions import ValidationError
from duevia.domain.money import Money

D = "2026-01-01T00:00:00+00:00"


def m(p):
    return Money(p, "INR")


def sides(intent):
    return [(l.account_id, l.side, l.amount.points) for l in intent.legs]


def test_expense():
    i = simple.build_expense(real_account_id=1, expense_account_id=2, amount=m(500), description="d", entry_date=D)
    assert i.entry_type == EntryType.NORMAL and i.category_id == 2
    assert sides(i) == [(1, Side.CREDIT, 500), (2, Side.DEBIT, 500)]


def test_income():
    i = simple.build_income(real_account_id=1, income_account_id=2, amount=m(500), description="d", entry_date=D)
    assert sides(i) == [(1, Side.DEBIT, 500), (2, Side.CREDIT, 500)]


@pytest.mark.parametrize("side,opposite", [(Side.DEBIT, Side.CREDIT), (Side.CREDIT, Side.DEBIT)])
def test_adjustment_uses_equity_on_the_opposite_side(side, opposite):
    i = simple.build_adjustment(real_account_id=1, equity_account_id=9, amount=m(5), side=side,
                                description="d", entry_date=D)
    assert i.entry_type == EntryType.ADJUSTMENT and i.category_id is None
    assert sides(i) == [(1, side, 5), (9, opposite, 5)]


def test_refund_links_original_and_reverses_expense_sides():
    i = refund.build_refund(real_account_id=1, expense_account_id=2, amount=m(200), description="d",
                            entry_date=D, refund_of_id=7)
    assert i.entry_type == EntryType.REFUND and i.refund_of_id == 7
    assert sides(i) == [(1, Side.DEBIT, 200), (2, Side.CREDIT, 200)]


def test_transfer():
    i = transfer.build_transfer(from_account_id=1, to_account_id=2, amount=m(100), description="d", entry_date=D)
    assert sides(i) == [(1, Side.CREDIT, 100), (2, Side.DEBIT, 100)]


def test_settlement_and_repayment_are_mirror_images():
    a = settlement.build_settlement(real_account_id=1, friend_due_account_id=5, amount=m(300), description="d", entry_date=D)
    b = settlement.build_repayment(real_account_id=1, friend_due_account_id=5, amount=m(300), description="d", entry_date=D)
    assert sides(a) == [(1, Side.DEBIT, 300), (5, Side.CREDIT, 300)]
    assert sides(b) == [(1, Side.CREDIT, 300), (5, Side.DEBIT, 300)]


def test_split_puts_only_owner_share_on_expense():
    i = split.build_split_expense(real_account_id=1, expense_account_id=2, owner_share=m(150),
                                  friend_shares=[(5, m(350))], description="d", entry_date=D)
    assert i.entry_type == EntryType.SPLIT and i.category_id == 2
    assert sides(i) == [(1, Side.CREDIT, 500), (2, Side.DEBIT, 150), (5, Side.DEBIT, 350)]


def test_split_with_zero_owner_share_has_no_expense_leg_but_keeps_category():
    i = split.build_split_expense(real_account_id=1, expense_account_id=2, owner_share=Money(0, "INR"),
                                  friend_shares=[(5, m(100)), (6, m(50))], description="d", entry_date=D)
    assert [l.account_id for l in i.legs] == [1, 5, 6] and i.category_id == 2


def test_fronted():
    i = split.build_friend_fronted_expense(expense_account_id=2, friend_due_account_id=5, amount=m(50),
                                           description="d", entry_date=D)
    assert i.entry_type == EntryType.FRONTED
    assert sides(i) == [(2, Side.DEBIT, 50), (5, Side.CREDIT, 50)]


def test_blank_description_is_rejected_by_every_strategy():
    with pytest.raises(ValidationError):
        simple.build_expense(real_account_id=1, expense_account_id=2, amount=m(1), description=" ", entry_date=D)
