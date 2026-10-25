import pytest

from monetary.domain.exceptions import ValidationError
from monetary.domain.tags import MAX_TAGS_PER_ENTRY, normalise_tag, normalise_tags


def test_normalise_tag():
    assert normalise_tag("  #Trip   To GOA ") == "trip to goa"


@pytest.mark.parametrize("bad", ["", "   ", "#", "a,b", "x" * 31, "a\x00b"])
def test_bad_names_are_rejected(bad):
    with pytest.raises(ValidationError):
        normalise_tag(bad)


def test_normalise_tags_dedupes_in_order_and_caps_the_count():
    assert normalise_tags(["B", "a", "b", "A"]) == ["b", "a"]
    assert normalise_tags(None) == [] and normalise_tags([]) == []
    with pytest.raises(ValidationError):
        normalise_tags([f"t{i}" for i in range(MAX_TAGS_PER_ENTRY + 1)])
