"""Schedule evaluation helpers — cron parsing and next-run calculation."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any


CRON_PRESETS: dict[str, str] = {
    "@hourly": "0 * * * *",
    "@daily": "0 0 * * *",
    "@weekly": "0 0 * * 0",
    "@monthly": "0 0 1 * *",
}


def _expand_field(field: str, low: int, high: int) -> set[int]:
    values: set[int] = set()
    for part in field.split(","):
        part = part.strip()
        step = 1
        if "/" in part:
            part, s = part.split("/", 1)
            step = max(1, int(s))

        if part == "*":
            values.update(range(low, high + 1, step))
        elif "-" in part:
            a, b = part.split("-", 1)
            values.update(range(int(a), int(b) + 1, step))
        else:
            values.add(int(part))
    return {v for v in values if low <= v <= high}


def parse_cron(expr: str) -> dict[str, set[int]]:
    expr = expr.strip()
    expr = CRON_PRESETS.get(expr, expr)
    parts = expr.split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: {expr}")
    return {
        "minute": _expand_field(parts[0], 0, 59),
        "hour": _expand_field(parts[1], 0, 23),
        "dom": _expand_field(parts[2], 1, 31),
        "month": _expand_field(parts[3], 1, 12),
        "dow": _expand_field(parts[4], 0, 6),
    }


def cron_matches(expr: str, dt: datetime) -> bool:
    parsed = parse_cron(expr)
    # Python weekday: 0=Mon..6=Sun; cron dow: 0=Sun..6=Sat
    cron_dow = (dt.weekday() + 1) % 7
    return (
        dt.minute in parsed["minute"]
        and dt.hour in parsed["hour"]
        and dt.day in parsed["dom"]
        and dt.month in parsed["month"]
        and cron_dow in parsed["dow"]
    )


def next_run_after(expr: str, after: datetime, max_iter: int = 1440 * 2) -> datetime | None:
    """Find the next minute after `after` that matches the cron expression."""
    from datetime import timedelta

    dt = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(max_iter):
        if cron_matches(expr, dt):
            return dt
        dt += timedelta(minutes=1)
    return None


def validate_schedule(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not data.get("url"):
        errors.append("url is required")
    if not data.get("cron"):
        errors.append("cron is required")
    else:
        try:
            parse_cron(data["cron"])
        except (ValueError, IndexError):
            errors.append(f"Invalid cron expression: {data['cron']}")
    return errors
