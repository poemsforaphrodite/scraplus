"""Optional HTTP response cache in Modal Dict (maxAge-style)."""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Callable

CACHE_DICT_NAME = "scraplus-http-cache-v1"
DEFAULT_TTL_SEC = 86400


def cache_key(url: str, parts: dict[str, Any]) -> str:
    canonical = json.dumps(
        {"url": url, **parts},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def cache_get(
    d_get: Callable[[str], dict[str, Any]],
    key: str,
    *,
    max_age_ms: int | None,
    min_age_ms: int | None,
) -> dict[str, Any] | None:
    now = time.time()
    try:
        raw = d_get(key)
    except (KeyError, TypeError):
        return None
    if not raw:
        return None
    stored_at = float(raw.get("stored_at", 0))
    age_ms = (now - stored_at) * 1000
    if min_age_ms is not None and age_ms < min_age_ms:
        return None
    if max_age_ms is not None and age_ms > max_age_ms:
        return None
    data = raw.get("data")
    if isinstance(data, dict):
        return data
    return None


def cache_put(
    d_set: Callable[[str, dict[str, Any]], None],
    key: str,
    data: dict[str, Any],
) -> None:
    d_set(
        key,
        {
            "stored_at": time.time(),
            "data": data,
        },
    )
