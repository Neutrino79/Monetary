"""Ledger database file naming and path confinement."""
from pathlib import Path

import pytest

from monetary.infrastructure import tenant_store as ts


def test_public_ids_are_random_32_hex_and_make_valid_filenames():
    a, b = ts.new_public_id(), ts.new_public_id()
    assert a != b and len(a) == 32
    assert ts.filename_for(a) == f"{a}.db"


@pytest.mark.parametrize("bad", ["", "../x", "ABC", "a" * 31, "g" * 32, "a" * 32 + "/b"])
def test_filename_for_rejects_anything_that_is_not_a_generated_id(bad):
    with pytest.raises(ValueError):
        ts.filename_for(bad)


def test_a_relative_path_resolves_inside_the_tenants_directory(tmp_path):
    name = ts.filename_for(ts.new_public_id())
    assert ts.resolve_db_path(tmp_path, name) == (tmp_path / "tenants" / name).resolve()


@pytest.mark.parametrize("bad", ["../control.db", "sub/" + "a" * 32 + ".db", "notes.txt", ".." , "a" * 32 + ".db/.."])
def test_a_relative_path_cannot_leave_the_tenants_directory(tmp_path, bad):
    with pytest.raises(ValueError):
        ts.resolve_db_path(tmp_path, bad)


def test_an_absolute_path_is_an_adopted_legacy_file_and_is_returned_as_is(tmp_path):
    legacy = tmp_path / "old" / "monetary.db"
    assert ts.resolve_db_path(tmp_path, str(legacy)) == Path(legacy)
