"""All SQL for tags. Names arrive already normalised (domain/tags.py)."""

from __future__ import annotations


def create_tag(conn, name: str) -> int:
    return conn.execute("INSERT INTO tag (name) VALUES (?)", (name,)).lastrowid


def existing_names(conn, names: list[str]) -> set[str]:
    if not names:
        return set()
    rows = conn.execute(f"SELECT name FROM tag WHERE name IN ({','.join('?' for _ in names)})", names).fetchall()
    return {r["name"] for r in rows}


def set_entry_tags(conn, entry_id: int, names: list[str]) -> None:
    """Make `names` (all existing tags) the entry's complete tag set."""
    conn.execute("DELETE FROM entry_tag WHERE journal_entry_id = ?", (entry_id,))
    for name in names:
        conn.execute(
            "INSERT INTO entry_tag (journal_entry_id, tag_id) SELECT ?, id FROM tag WHERE name = ?",
            (entry_id, name))


def copy_entry_tags(conn, from_id: int, to_id: int) -> None:
    """A STRICT-mode edit posts a replacement entry; it keeps the original's tags."""
    conn.execute(
        "INSERT OR IGNORE INTO entry_tag (journal_entry_id, tag_id) "
        "SELECT ?, tag_id FROM entry_tag WHERE journal_entry_id = ?", (to_id, from_id))


def tags_for_entries(conn, entry_ids: list[int]) -> dict[int, list[str]]:
    if not entry_ids:
        return {}
    rows = conn.execute(
        "SELECT et.journal_entry_id AS entry_id, t.name FROM entry_tag et JOIN tag t ON t.id = et.tag_id "
        f"WHERE et.journal_entry_id IN ({','.join('?' for _ in entry_ids)}) ORDER BY t.name", entry_ids).fetchall()
    out: dict[int, list[str]] = {}
    for r in rows:
        out.setdefault(r["entry_id"], []).append(r["name"])
    return out


def list_tags(conn) -> list[dict]:
    """Every tag with how many live (posted) transactions carry it, alphabetical."""
    rows = conn.execute(
        "SELECT t.id, t.name, COUNT(je.id) AS uses FROM tag t "
        "LEFT JOIN entry_tag et ON et.tag_id = t.id "
        "LEFT JOIN journal_entry je ON je.id = et.journal_entry_id "
        "AND je.status = 'POSTED' AND je.entry_type != 'REVERSAL' "
        "GROUP BY t.id ORDER BY t.name").fetchall()
    return [dict(r) for r in rows]


def get_tag(conn, tag_id: int) -> dict | None:
    row = conn.execute("SELECT id, name FROM tag WHERE id = ?", (tag_id,)).fetchone()
    return dict(row) if row else None


def get_tag_by_name(conn, name: str) -> dict | None:
    row = conn.execute("SELECT id, name FROM tag WHERE name = ?", (name,)).fetchone()
    return dict(row) if row else None


def rename_tag(conn, tag_id: int, name: str) -> None:
    conn.execute("UPDATE tag SET name = ? WHERE id = ?", (name, tag_id))


def merge_tag(conn, source_id: int, target_id: int) -> None:
    """Move every transaction from `source` to `target`, then remove `source`."""
    conn.execute(
        "INSERT OR IGNORE INTO entry_tag (journal_entry_id, tag_id) "
        "SELECT journal_entry_id, ? FROM entry_tag WHERE tag_id = ?", (target_id, source_id))
    delete_tag(conn, source_id)


def delete_tag(conn, tag_id: int) -> None:
    conn.execute("DELETE FROM entry_tag WHERE tag_id = ?", (tag_id,))
    conn.execute("DELETE FROM tag WHERE id = ?", (tag_id,))
