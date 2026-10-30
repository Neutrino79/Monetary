"""Reports application service: the analysis behind the Reports & Trends page.

Read-only. Everything is in the owner's home currency (a ledger can hold others, but a trend that
mixes currencies means nothing) and per calendar month in the owner's timezone. The arithmetic
lives in domain/report_analytics.py; this module fetches the monthly series and assembles them.

Every report takes `months`, the length of the window ending with the current month, and compares
it with the equal window just before it. The current month is always partial; where a statistic
would be skewed by that (what is "normal", what a budget held) it is left out.
"""

from __future__ import annotations

from monetary.domain import report_analytics as ra
from monetary.domain.enums import AccountType
from monetary.domain.time_utils import current_year_month, month_bounds_utc_iso
from monetary.infrastructure import repositories as repo

# A tidy limit is a multiple of 500.00 in the 2-decimal minor units this app stores.
LIMIT_STEP = 50_000
# Savings rate that counts as a good month in the overview's findings.
GOOD_SAVINGS_RATE = 30.0

Month = tuple[int, int]


# ------------------------------------------------------------------ helpers ---
def shift_month(year: int, month: int, delta: int) -> Month:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def window(tz: str | None, count: int, *, ending_before_current: bool = False) -> list[Month]:
    """The last `count` months, oldest first, ending with the current month (or the one before it)."""
    year, month = current_year_month(tz)
    end = -1 if ending_before_current else 0
    return [shift_month(year, month, end - i) for i in range(count - 1, -1, -1)]


def _roots(conn, account_type: str, currency: str) -> list[dict]:
    return [r for r in repo.all_root_categories(conn, account_type) if r["currency_code"] == currency]


def _monthly(conn, tz, roots: list[dict], account_type: str, months: list[Month]) -> dict[int, list[int]]:
    """root category id -> net points per month, subcategories rolled in."""
    normal_debit = AccountType(account_type).normal_side.value == "DEBIT"
    bounds = [month_bounds_utc_iso(tz, y, m) for y, m in months]
    out: dict[int, list[int]] = {}
    for root in roots:
        ids = [root["id"]] + repo.child_account_ids(conn, root["id"])
        row = []
        for start, end in bounds:
            debit, credit = repo.account_period_debit_credit(conn, ids, start, end)
            row.append(debit - credit if normal_debit else credit - debit)
        out[root["id"]] = row
    return out


def _column_sums(series: dict[int, list[int]], length: int) -> list[int]:
    return [sum(row[i] for row in series.values()) for i in range(length)]


def _rate(net: int, income: int) -> float | None:
    return round(net / income * 100, 1) if income > 0 else None


def _first_active(conn, tz, currency: str, months: list[Month]) -> int:
    """Index of the first month with any income or spending, or len(months) when there is none.
    Months before the ledger existed are not 'quiet months', they are no data, so they must not
    drag a category's normal down to zero."""
    roots = [(_roots(conn, t, currency), t) for t in (AccountType.INCOME.value, AccountType.EXPENSE.value)]
    totals = [_column_sums(_monthly(conn, tz, r, t, months), len(months)) for r, t in roots]
    return next((i for i in range(len(months)) if any(col[i] for col in totals)), len(months))


def _assets_and_liabilities(conn, tz, currency: str, months: list[Month]) -> list[tuple[int, int]]:
    """(assets, liabilities) at the end of each month, for accounts in `currency`."""
    accounts = [a for a in repo.list_accounts(
        conn, account_types=(AccountType.ASSET.value, AccountType.LIABILITY.value), include_inactive=True,
    ) if a["currency_code"] == currency]
    out = []
    for year, month in months:
        _start, end = month_bounds_utc_iso(tz, year, month)
        assets = liabilities = 0
        for acc in accounts:
            side = AccountType(acc["account_type"]).normal_side.value
            points = repo.account_balance_points_as_of(conn, acc["id"], side, end)
            if acc["account_type"] == AccountType.ASSET.value:
                assets += points
            else:
                liabilities += points
        out.append((assets, liabilities))
    return out


def _period_bounds(tz, first: Month, last: Month) -> tuple[str, str]:
    return month_bounds_utc_iso(tz, *first)[0], month_bounds_utc_iso(tz, *last)[1]


# ----------------------------------------------------------------- overview ---
def overview(conn, owner, *, months: int) -> dict:
    """Am I better off than before? Monthly income/spending/kept for the window and the one before
    it, the unusual months, net worth with what is owed, income by source, and the findings."""
    tz, currency = owner["timezone"], owner["home_currency_code"]
    both = window(tz, months * 2)
    previous_months, this_months = both[:months], both[months:]
    income_roots = _roots(conn, AccountType.INCOME.value, currency)
    expense_roots = _roots(conn, AccountType.EXPENSE.value, currency)
    income_by = _monthly(conn, tz, income_roots, AccountType.INCOME.value, both)
    expense = _column_sums(_monthly(conn, tz, expense_roots, AccountType.EXPENSE.value, both), len(both))
    income = _column_sums(income_by, len(both))

    def period(lo: int, hi: int) -> dict:
        inc, exp = sum(income[lo:hi]), sum(expense[lo:hi])
        return {"income": inc, "expense": exp, "net": inc - exp, "savings_rate": _rate(inc - exp, inc),
                "average_income": round(inc / (hi - lo)), "average_expense": round(exp / (hi - lo))}

    cur_exp = expense[months:]
    begin = next((i for i in range(months) if income[months + i] or cur_exp[i]), months)
    complete = cur_exp[begin:-1]                  # the current month is partial, months before the ledger are no data
    unusual = {begin + i for i in ra.unusual_indexes(complete)}
    rolling = ra.rolling_mean(cur_exp, 3)
    mean_exp = ra.mean(complete) if complete else 0.0
    points = []
    for i, (year, month) in enumerate(this_months):
        inc, exp = income[months + i], cur_exp[i]
        points.append({
            "year": year, "month": month, "is_partial": i == months - 1,
            "income": inc, "expense": exp, "net": inc - exp, "savings_rate": _rate(inc - exp, inc),
            "rolling_expense": rolling[i],
            "unusual": i in unusual,
            "versus_usual_pct": ra.pct_change(exp, mean_exp) if i in unusual else None,
        })
    earlier = [{"year": y, "month": m, "income": income[i], "expense": expense[i], "net": income[i] - expense[i],
                "savings_rate": _rate(income[i] - expense[i], income[i])}
               for i, (y, m) in enumerate(previous_months)]

    balances = _assets_and_liabilities(conn, tz, currency, this_months)
    net_worth = [{"year": y, "month": m, "assets": a, "liabilities": liab, "net_worth": a - liab}
                 for (y, m), (a, liab) in zip(this_months, balances)]

    ranked = sorted(income_by.items(), key=lambda kv: sum(kv[1][months:]), reverse=True)
    names = {r["id"]: r for r in income_roots}
    sources = []
    for cat_id, row in ranked[:4]:
        if sum(row[months:]) > 0:
            sources.append({"category_id": cat_id, "name": names[cat_id]["name"], "color": names[cat_id]["color"],
                            "points": row[months:]})
    rest = [row[months:] for _cid, row in ranked[4:] if sum(row[months:]) > 0]
    if rest:
        sources.append({"category_id": None, "name": "Other income", "color": None,
                        "points": [sum(col) for col in zip(*rest)]})

    current, before = period(months, months * 2), period(0, months)
    return {
        "currency": currency, "months": months,
        "points": points, "previous_points": earlier,
        "current": current, "previous": before,
        "net_worth": net_worth, "income_sources": sources,
        "findings": _findings(current, before, points, net_worth, sources),
    }


def _findings(current, before, points, net_worth, sources) -> list[dict]:
    """The overview's plain-language findings, as codes plus numbers; the client words them."""
    found = []
    rate = current["savings_rate"]
    if rate is not None:
        done = [p for p in points if not p["is_partial"] and p["savings_rate"] is not None]
        found.append({"code": "savings_rate", "tone": "good" if rate >= GOOD_SAVINGS_RATE else "neutral",
                      "rate": rate, "previous_rate": before["savings_rate"],
                      "good_months": sum(1 for p in done if p["savings_rate"] >= GOOD_SAVINGS_RATE),
                      "complete_months": len(done)})
    flagged = [{"year": p["year"], "month": p["month"], "pct": p["versus_usual_pct"]} for p in points if p["unusual"]]
    if flagged:
        found.append({"code": "unusual_months", "tone": "watch", "flagged": flagged})
    if sources and current["average_expense"] > 0:
        top = sources[0]
        average = round(sum(top["points"]) / len(top["points"]))
        found.append({"code": "main_income_cover", "tone": "good" if average >= current["average_expense"] else "neutral",
                      "name": top["name"], "average": average,
                      "cover_pct": round(average / current["average_expense"] * 100)})
    if net_worth and net_worth[0]["liabilities"] > 0 and net_worth[-1]["liabilities"] != net_worth[0]["liabilities"]:
        first, last = net_worth[0]["liabilities"], net_worth[-1]["liabilities"]
        found.append({"code": "debt_change", "tone": "good" if last < first else "watch",
                      "from_points": first, "to_points": last, "change_pct": ra.pct_change(last, first)})
    return found


# --------------------------------------------------------------- categories ---
def categories(conn, owner, *, months: int, kind: str) -> dict:
    """Every category against its own normal: the usual range, trend, and growth against the
    previous window. `kind` is 'spending' or 'income'."""
    tz, currency = owner["timezone"], owner["home_currency_code"]
    account_type = AccountType.EXPENSE.value if kind == "spending" else AccountType.INCOME.value
    shown = max(months, 6)                         # a 3-month window is too short to show a normal range
    fetched = window(tz, max(shown, months * 2))
    roots = _roots(conn, account_type, currency)
    totals = _monthly(conn, tz, roots, account_type, fetched)
    begin = max(0, _first_active(conn, tz, currency, fetched) - (len(fetched) - shown))   # in `series` terms

    rows = []
    for root in roots:
        full = totals[root["id"]]
        if not any(full):
            continue
        series = full[-shown:]
        usual = ra.usual_range(series[begin:-1])
        state = ra.classify(series[-1], usual)
        average, earlier = ra.mean(full[-months:]), ra.mean(full[-2 * months:-months])
        rows.append({
            "category_id": root["id"], "name": root["name"], "color": root["color"],
            "points": series, "current": series[-1],
            "usual": None if usual is None else {"low": usual[0], "median": usual[1], "high": usual[2]},
            "state": state,
            "versus_usual_pct": ra.pct_change(series[-1], usual[1]) if usual else None,
            "slope": round(ra.slope(series)),
            "average": round(average), "previous_average": round(earlier),
            "change_pct": ra.pct_change(average, earlier),
        })
    total_avg = sum(r["average"] for r in rows)
    for r in rows:
        r["share_pct"] = round(r["average"] / total_avg * 100, 1) if total_avg else 0.0
    rows.sort(key=lambda r: r["average"], reverse=True)
    total_prev = sum(r["previous_average"] for r in rows)
    return {
        "currency": currency, "kind": kind, "months": months,
        "series_months": [{"year": y, "month": m} for y, m in fetched[-shown:]],
        "categories": rows,
        "total": {"average": total_avg, "previous_average": total_prev, "change_pct": ra.pct_change(total_avg, total_prev)},
    }


# ------------------------------------------------------------------ compare ---
def compare(conn, owner, *, a: tuple[Month, Month], b: tuple[Month, Month]) -> dict:
    """Period A against period B (each a first month..last month range, inclusive): totals, kept,
    and per spending category the change split into 'bought more often' and 'paid more each time'."""
    tz, currency = owner["timezone"], owner["home_currency_code"]
    spans = {}
    for key, (first, last) in (("a", a), ("b", b)):
        start, end = _period_bounds(tz, first, last)
        spans[key] = (start, end)

    def total(roots, account_type, key):
        start, end = spans[key]
        normal_debit = AccountType(account_type).normal_side.value == "DEBIT"
        out = {}
        for root in roots:
            ids = [root["id"]] + repo.child_account_ids(conn, root["id"])
            debit, credit = repo.account_period_debit_credit(conn, ids, start, end)
            out[root["id"]] = (debit - credit if normal_debit else credit - debit, ids)
        return out

    expense_roots = _roots(conn, AccountType.EXPENSE.value, currency)
    income_roots = _roots(conn, AccountType.INCOME.value, currency)
    rows = []
    totals = {"a": {}, "b": {}}
    for key in ("a", "b"):
        exp = total(expense_roots, AccountType.EXPENSE.value, key)
        inc = total(income_roots, AccountType.INCOME.value, key)
        totals[key] = {"expense": sum(v for v, _ in exp.values()), "income": sum(v for v, _ in inc.values()), "by": exp}
    for root in expense_roots:
        points_a, ids = totals["a"]["by"][root["id"]]
        points_b, _ = totals["b"]["by"][root["id"]]
        if points_a == 0 and points_b == 0:
            continue
        count_a = repo.account_purchase_count(conn, ids, *spans["a"])
        count_b = repo.account_purchase_count(conn, ids, *spans["b"])
        volume, ticket = ra.volume_and_ticket(count_a, points_a, count_b, points_b)
        rows.append({
            "category_id": root["id"], "name": root["name"], "color": root["color"],
            "a": points_a, "b": points_b, "change": points_a - points_b,
            "change_pct": ra.pct_change(points_a, points_b),
            "purchases_a": count_a, "purchases_b": count_b,
            "average_purchase_a": round(points_a / count_a) if count_a else 0,
            "average_purchase_b": round(points_b / count_b) if count_b else 0,
            "volume_effect": volume, "ticket_effect": ticket,
        })
    rows.sort(key=lambda r: abs(r["change"]), reverse=True)
    span_total = sum(abs(r["change"]) for r in rows)
    for r in rows:
        r["share_of_change_pct"] = round(abs(r["change"]) / span_total * 100) if span_total else 0

    def side(key):
        t = totals[key]
        return {"income": t["income"], "expense": t["expense"], "kept": t["income"] - t["expense"]}

    return {"currency": currency, "a": side("a"), "b": side("b"), "categories": rows,
            "volume_effect": sum(r["volume_effect"] for r in rows), "ticket_effect": sum(r["ticket_effect"] for r in rows)}


# ------------------------------------------------------------------ budgets ---
def budget_history(conn, owner, *, months: int) -> dict:
    """How each budget has actually run: spending per month, how often it held, and the limit that
    would have fit; plus spending that has no budget at all."""
    tz, currency = owner["timezone"], owner["home_currency_code"]
    span = window(tz, months)
    budgeted = [r for r in repo.budgeted_root_accounts(conn) if r["currency_code"] == currency]
    budget_ids = {r["id"] for r in budgeted}
    expense_roots = _roots(conn, AccountType.EXPENSE.value, currency)
    spent = _monthly(conn, tz, expense_roots, AccountType.EXPENSE.value, span)
    begin = _first_active(conn, tz, currency, span)

    rows = []
    for root in budgeted:
        series = spent[root["id"]]
        verdict = ra.suggest_budget(series[begin:-1], root["budget_limit"], step=LIMIT_STEP)
        rows.append({
            "category_id": root["id"], "name": root["name"], "color": root["color"],
            "limit": root["budget_limit"], "points": series,
            "months_over": verdict["months_over"], "held": verdict["held"], "complete_months": verdict["months"],
            "typical_pct": verdict["typical_pct"],
            "suggestion": {"action": verdict["action"], "limit": verdict["limit_points"],
                           "recent_overshoot": verdict["recent_overshoot_points"]},
        })
    limit_total = sum(r["limit"] for r in rows)
    month_totals = [{"year": y, "month": m, "is_partial": i == len(span) - 1,
                     "spent": sum(r["points"][i] for r in rows)} for i, (y, m) in enumerate(span)]

    unbudgeted = []
    for root in expense_roots:
        if root["id"] in budget_ids:
            continue
        series = spent[root["id"]]
        done = series[begin:-1]
        if not any(series):
            continue
        average = round(ra.mean(done)) if done else round(ra.mean(series))
        if ra.is_lumpy(done):
            suggestion = {"period": "year", "limit": ra.round_up(ra.mean(done) * 12, LIMIT_STEP)}
        else:
            suggestion = {"period": "month", "limit": ra.round_up(ra.percentile(done or series, 0.8) * 1.1, LIMIT_STEP)}
        unbudgeted.append({"category_id": root["id"], "name": root["name"], "color": root["color"],
                           "average": average, "peak": max(series), "suggestion": suggestion})
    unbudgeted.sort(key=lambda r: r["average"], reverse=True)

    all_spend = sum(sum(spent[r["id"]][begin:-1]) for r in expense_roots)
    covered = sum(sum(spent[i][begin:-1]) for i in budget_ids if i in spent)
    return {
        "currency": currency, "months": months,
        "budgets": rows, "limit_total": limit_total, "month_totals": month_totals,
        "unbudgeted": unbudgeted,
        "held": sum(r["held"] for r in rows), "budget_months": sum(r["complete_months"] for r in rows),
        "coverage_pct": round(covered / all_spend * 100) if all_spend else None,
    }


# ------------------------------------------------------------------ outlook ---
FORECAST_MONTHS = 12


def outlook(conn, owner, *, months: int) -> dict:
    """Where net worth is heading if the recent past repeats, how the current year will
    probably end, and which budget overshoots would be worth the most to fix.

    It learns from the last `months` complete months (a year or more: each coming month repeats the
    same month a year earlier; fewer: their average). The likely range is one standard deviation of
    the running total. The rest of the current month is projected as what is still expected after
    what has already happened.
    """
    from monetary.application import dashboard_service

    tz, currency = owner["timezone"], owner["home_currency_code"]
    learn = 12 if months >= 12 else max(months, 3)
    history = window(tz, learn, ending_before_current=True)
    income_roots = _roots(conn, AccountType.INCOME.value, currency)
    expense_roots = _roots(conn, AccountType.EXPENSE.value, currency)
    year, month = current_year_month(tz)
    ytd = [(year, m) for m in range(1, month + 1)]
    needed = history + [m for m in ytd if m not in history]
    inc_series = _monthly(conn, tz, income_roots, AccountType.INCOME.value, needed)
    exp_series = _monthly(conn, tz, expense_roots, AccountType.EXPENSE.value, needed)
    income = {m: sum(row[i] for row in inc_series.values()) for i, m in enumerate(needed)}
    expense = {m: sum(row[i] for row in exp_series.values()) for i, m in enumerate(needed)}
    income_hist = [income[m] for m in history]
    expense_hist = [expense[m] for m in history]
    net_hist = [i - e for i, e in zip(income_hist, expense_hist)]

    worth_now = next((n["net_worth"] for n in dashboard_service.net_worth(conn) if n["currency"] == currency), 0)
    trail = window(tz, 12)
    balances = _assets_and_liabilities(conn, tz, currency, trail)
    result = {
        "currency": currency, "months": months, "learned_from": len(history),
        "net_worth_now": worth_now,
        "history": [{"year": y, "month": m, "net_worth": a - liab} for (y, m), (a, liab) in zip(trail, balances)],
        "method": "none", "forecast": [], "year_end": None, "typical_monthly_kept": round(ra.mean(net_hist)) if net_hist else 0,
        "levers": _levers(conn, tz, currency),
    }
    if not any(income_hist) and not any(expense_hist):
        return result                             # nothing to learn from yet
    method, income_fc = ra.forecast_series(income_hist, FORECAST_MONTHS)
    _method, expense_fc = ra.forecast_series(expense_hist, FORECAST_MONTHS)
    if method == "none":
        return result

    # the rest of this month: what is still expected after what has already happened
    left_income = max(0, income_fc[0] - income[(year, month)])
    left_expense = max(0, expense_fc[0] - expense[(year, month)])
    steps = [left_income - left_expense] + [income_fc[i] - expense_fc[i] for i in range(1, FORECAST_MONTHS)]
    band = ra.spread(net_hist, FORECAST_MONTHS)
    running, forecast = worth_now, []
    for i, step in enumerate(steps):
        running += step
        y, m = shift_month(year, month, i)
        forecast.append({"year": y, "month": m, "expected": running, "low": running - band[i], "high": running + band[i]})
    result["method"], result["forecast"] = method, forecast

    to_year_end = 12 - month                      # forecast index of December
    income_year = sum(income[m] for m in ytd) + left_income + sum(income_fc[1:to_year_end + 1])
    expense_year = sum(expense[m] for m in ytd) + left_expense + sum(expense_fc[1:to_year_end + 1])
    result["year_end"] = {
        "year": year, "net_worth": forecast[to_year_end],
        "income": income_year, "expense": expense_year, "kept": income_year - expense_year,
        "savings_rate": _rate(income_year - expense_year, income_year),
    }
    return result


def _levers(conn, tz, currency: str) -> list[dict]:
    """Budgets the last three complete months ran over: holding the limit is the saving."""
    recent = window(tz, 3, ending_before_current=True)
    budgeted = [r for r in repo.budgeted_root_accounts(conn) if r["currency_code"] == currency]
    spent = _monthly(conn, tz, budgeted, AccountType.EXPENSE.value, recent)
    out = []
    for root in budgeted:
        typical = round(ra.mean(spent[root["id"]]))
        if typical > root["budget_limit"]:
            out.append({"category_id": root["id"], "name": root["name"], "limit": root["budget_limit"],
                        "typical": typical, "monthly_saving": typical - root["budget_limit"]})
    out.sort(key=lambda r: r["monthly_saving"], reverse=True)
    return out
