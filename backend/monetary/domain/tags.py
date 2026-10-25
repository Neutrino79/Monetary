"""Tag names: the one place that decides what a valid tag is."""

from __future__ import annotations

from monetary.domain.exceptions import ValidationError

MAX_TAG_LENGTH = 30
MAX_TAGS_PER_ENTRY = 10


def normalise_tag(raw: str) -> str:
    """Trim, drop a leading '#', collapse inner whitespace and lowercase. Raises ValidationError when the
    result is empty, too long, or contains a comma or control character."""
    name = " ".join((raw or "").strip().lstrip("#").split()).lower()
    if not name:
        raise ValidationError("A tag can't be empty.")
    if len(name) > MAX_TAG_LENGTH:
        raise ValidationError(f"A tag can be at most {MAX_TAG_LENGTH} characters: {name[:12]!r}...")
    if "," in name or any(ord(c) < 32 for c in name):
        raise ValidationError("A tag can't contain commas or control characters.")
    return name


def normalise_tags(raw: list[str] | None) -> list[str]:
    """Normalise a list, drop duplicates (keeping order) and enforce the per-transaction limit."""
    seen: dict[str, None] = {}
    for item in raw or []:
        seen.setdefault(normalise_tag(item), None)
    names = list(seen)
    if len(names) > MAX_TAGS_PER_ENTRY:
        raise ValidationError(f"A transaction can have at most {MAX_TAGS_PER_ENTRY} tags.")
    return names
