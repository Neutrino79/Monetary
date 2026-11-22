"""A friend cannot be the account holder: the owner's email is required and checked on create and edit."""
import pytest

from monetary.application import user_service
from monetary.domain.exceptions import ConflictError
from tests.support import sample_data as sd

OWN = sd.OWNER["email"]


def test_adding_a_friend_with_the_owners_email_is_rejected_whatever_its_case(ctx):
    for email in (OWN, OWN.upper(), f"  {OWN.title()}  "):
        with pytest.raises(ConflictError):
            user_service.add_friend(ctx.conn, name="Me", email=email, own_email=OWN)
    assert len(user_service.list_friends(ctx.conn)) == len(sd.FRIENDS)


def test_editing_a_friend_to_the_owners_email_is_rejected_and_changes_nothing(ctx):
    friend_id = next(iter(ctx.friend.values()))
    before = user_service.get_friend_or_raise(ctx.conn, friend_id)["email"]
    with pytest.raises(ConflictError):
        user_service.update_friend(ctx.conn, friend_id, fields={"email": OWN.upper()}, own_email=OWN)
    assert user_service.get_friend_or_raise(ctx.conn, friend_id)["email"] == before


def test_the_owners_email_is_required_not_optional(ctx):
    with pytest.raises(TypeError):
        user_service.add_friend(ctx.conn, name="X", email="x@example.com")
    with pytest.raises(TypeError):
        user_service.update_friend(ctx.conn, next(iter(ctx.friend.values())), fields={"name": "Y"})


def test_another_email_is_fine_and_an_unchanged_email_is_not_a_conflict(ctx):
    created = user_service.add_friend(ctx.conn, name="Neha", email="Neha@Example.com", own_email=OWN)
    assert created["email"] == "neha@example.com"
    same = user_service.update_friend(
        ctx.conn, created["id"], fields={"email": "neha@example.com", "name": "Neha K"}, own_email=OWN)
    assert same["name"] == "Neha K" and same["email"] == "neha@example.com"
