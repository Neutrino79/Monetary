"""Plain-text table rendering for the CLI (no external dependencies)."""

from __future__ import annotations

from duevia.domain.time_utils import utc_iso_to_local_display


def print_table(headers: list[str], rows: list[list]) -> None:
    if not rows:
        print("(no rows)")
        return
    widths = [len(h) for h in headers]
    str_rows = [[str(c) for c in row] for row in rows]
    for row in str_rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))

    def fmt_row(cells):
        return "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(cells))

    print(fmt_row(headers))
    print("  ".join("-" * w for w in widths))
    for row in str_rows:
        print(fmt_row(row))


def fmt_dt(utc_iso: str | None, tz_name: str | None) -> str:
    if not utc_iso:
        return "-"
    return utc_iso_to_local_display(utc_iso, tz_name)


def fmt_bool(value) -> str:
    return "yes" if value else "no"


def fmt_points(points: int) -> str:
    sign = "-" if points < 0 else ""
    p = abs(points)
    return f"{sign}{p // 100}.{p % 100:02d}"
