"""Change detection / diff computation for monitors."""

from __future__ import annotations

import difflib
import re
from typing import Any

from bs4 import BeautifulSoup


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def diff_exact(old: str, new: str) -> dict[str, Any]:
    if old == new:
        return {"changed": False, "status": "same"}
    return {
        "changed": True,
        "status": "changed",
        "diff": _unified_diff(old, new),
    }


def diff_semantic(old: str, new: str) -> dict[str, Any]:
    old_n = normalize_text(old)
    new_n = normalize_text(new)
    if old_n == new_n:
        return {"changed": False, "status": "same"}
    return {
        "changed": True,
        "status": "changed",
        "diff": _unified_diff(old_n, new_n),
    }


def diff_selector(
    old_html: str,
    new_html: str,
    selectors: dict[str, str],
) -> dict[str, Any]:
    old_soup = BeautifulSoup(old_html, "lxml")
    new_soup = BeautifulSoup(new_html, "lxml")

    changes: dict[str, Any] = {}
    any_changed = False

    for name, sel in selectors.items():
        old_el = old_soup.select_one(sel)
        new_el = new_soup.select_one(sel)
        old_text = old_el.get_text(strip=True) if old_el else ""
        new_text = new_el.get_text(strip=True) if new_el else ""
        if old_text != new_text:
            any_changed = True
            changes[name] = {"old": old_text, "new": new_text, "changed": True}
        else:
            changes[name] = {"value": old_text, "changed": False}

    return {
        "changed": any_changed,
        "status": "changed" if any_changed else "same",
        "fields": changes,
    }


def compute_diff(
    old_content: str,
    new_content: str,
    diff_mode: str = "exact",
    selectors: dict[str, str] | None = None,
) -> dict[str, Any]:
    if diff_mode == "semantic":
        return diff_semantic(old_content, new_content)
    elif diff_mode == "selector" and selectors:
        return diff_selector(old_content, new_content, selectors)
    return diff_exact(old_content, new_content)


def _unified_diff(old: str, new: str) -> str:
    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)
    return "".join(
        difflib.unified_diff(old_lines, new_lines, fromfile="previous", tofile="current", lineterm="")
    )
