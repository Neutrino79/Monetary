"""Tags: free-form labels on transactions, used to filter and group (never part of the ledger maths)."""

from __future__ import annotations

from monetary.domain.exceptions import ConflictError, NotFoundError, ValidationError
from monetary.domain.tags import normalise_tag, normalise_tags
from monetary.infrastructure import tag_repository as repo

__all__ = ["checked_tags", "apply_after_create", "apply_after_edit", "list_tags", "create", "rename", "delete"]


def checked_tags(conn, raw: list[str] | None) -> list[str]:
    """Normalise a transaction's tags and require that each one exists (tags are created on their own)."""
    names = normalise_tags(raw)
    unknown = [n for n in names if n not in repo.existing_names(conn, names)]
    if unknown:
        raise ValidationError(f"Unknown tag{'s' if len(unknown) > 1 else ''}: {', '.join(unknown)}. "
                              "Create tags first under Tags.")
    return names


def create(conn, name: str) -> dict:
    clean = normalise_tag(name)
    if repo.get_tag_by_name(conn, clean):
        raise ConflictError(f"The tag {clean!r} already exists.")
    tag_id = repo.create_tag(conn, clean)
    return next(t for t in repo.list_tags(conn) if t["id"] == tag_id)


def apply_after_create(conn, entry_id: int, tags: list[str] | None) -> None:
    if tags:
        repo.set_entry_tags(conn, entry_id, tags)


def apply_after_edit(conn, old_id: int, new_id: int, tags: list[str] | None) -> None:
    """`tags` is the new complete set, or None to leave the tags alone. A replacement entry (STRICT mode,
    or an edit that converts the type) inherits the original's tags first."""
    if new_id != old_id:
        repo.copy_entry_tags(conn, old_id, new_id)
    if tags is not None:
        repo.set_entry_tags(conn, new_id, tags)


def list_tags(conn) -> list[dict]:
    return repo.list_tags(conn)


def _get(conn, tag_id: int) -> dict:
    tag = repo.get_tag(conn, tag_id)
    if tag is None:
        raise NotFoundError(f"Tag {tag_id} not found.")
    return tag


def rename(conn, tag_id: int, new_name: str) -> dict:
    """Rename a tag. Renaming onto an existing tag merges the two."""
    _get(conn, tag_id)
    name = normalise_tag(new_name)
    existing = repo.get_tag_by_name(conn, name)
    if existing and existing["id"] != tag_id:
        repo.merge_tag(conn, tag_id, existing["id"])
        return next(t for t in repo.list_tags(conn) if t["id"] == existing["id"])
    repo.rename_tag(conn, tag_id, name)
    return next(t for t in repo.list_tags(conn) if t["id"] == tag_id)


def delete(conn, tag_id: int) -> None:
    """Remove the tag from every transaction. The transactions themselves are untouched."""
    _get(conn, tag_id)
    repo.delete_tag(conn, tag_id)
