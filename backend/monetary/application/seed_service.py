"""First-run seeding: default expense categories and income sources.

The defaults ship as `monetary/seed_defaults.json`; point MONETARY_SEED_DEFAULTS_PATH
at another JSON file of the same shape to replace them. Seeding runs inside the
same request transaction as owner bootstrap, so a bad custom file aborts setup
cleanly instead of leaving a half-initialised instance.
"""

from __future__ import annotations

import json
from pathlib import Path

from monetary.application import account_service
from monetary.config import seed_defaults_path_from_environment
from monetary.domain.enums import AccountType
from monetary.domain.exceptions import ValidationError

_BUNDLED = Path(__file__).resolve().parent.parent / "seed_defaults.json"


def load_defaults() -> dict:
    path = Path(seed_defaults_path_from_environment() or _BUNDLED)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValidationError(f"Could not read seed defaults from {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValidationError(f"Seed defaults file {path} must contain a JSON object.")
    return data


def _seed_group(conn, items, category_type: str, currency: str) -> int:
    created = 0
    for item in items or []:
        if not isinstance(item, dict) or not item.get("name"):
            raise ValidationError("Each seed category needs a 'name'.")
        parent = account_service.create_category(
            conn, name=item["name"], category_type=category_type, currency_code=currency,
            budget_limit_major=item.get("budget"), color=item.get("color"))
        created += 1
        for child in item.get("children") or []:
            account_service.create_category(
                conn, name=child["name"], category_type=category_type, parent_id=parent["id"],
                currency_code=currency, color=child.get("color"))
            created += 1
    return created


def seed_default_categories(conn, *, currency_code: str) -> int:
    """Create the configured default categories. Returns how many were created."""
    data = load_defaults()
    return (_seed_group(conn, data.get("expense"), AccountType.EXPENSE.value, currency_code)
            + _seed_group(conn, data.get("income"), AccountType.INCOME.value, currency_code))
