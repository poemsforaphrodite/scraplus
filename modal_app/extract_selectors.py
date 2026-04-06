"""Deterministic CSS-selector extraction from HTML."""

from __future__ import annotations

from typing import Any

from bs4 import BeautifulSoup


def extract_with_selectors(
    html: str,
    selectors: dict[str, str],
    *,
    array_fields: set[str] | None = None,
) -> dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    out: dict[str, Any] = {}
    arrays = array_fields or set()
    for key, sel in selectors.items():
        if not isinstance(sel, str) or not sel.strip():
            out[key] = None
            continue
        if key in arrays:
            els = soup.select(sel)
            out[key] = [el.get_text(separator=" ", strip=True) for el in els]
        else:
            el = soup.select_one(sel)
            out[key] = el.get_text(separator=" ", strip=True) if el else None
    return out
