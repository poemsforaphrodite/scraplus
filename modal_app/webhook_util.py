"""Signed webhook delivery for crawl events."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import httpx


def sign_body(secret: str, raw_body: bytes) -> str:
    digest = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={digest}"


def deliver_webhook(
    webhook_url: str,
    secret: str,
    event_type: str,
    payload: dict[str, Any],
    *,
    timeout: float = 15.0,
    metadata: dict[str, Any] | None = None,
) -> tuple[bool, str]:
    body: dict[str, Any] = {
        "success": True,
        "type": event_type,
        "data": payload,
        "metadata": metadata or {},
    }
    raw = json.dumps(body, separators=(",", ":"), default=str).encode("utf-8")
    sig = sign_body(secret, raw)
    headers = {
        "Content-Type": "application/json",
        "X-Scraplus-Signature": sig,
    }
    try:
        t = httpx.Timeout(timeout, connect=min(10.0, timeout))
        with httpx.Client(timeout=t, follow_redirects=True) as client:
            r = client.post(webhook_url, content=raw, headers=headers)
            if 200 <= r.status_code < 300:
                return True, ""
            return False, f"HTTP {r.status_code}: {r.text[:500]}"
    except Exception as e:
        return False, str(e)


def deliver_with_retries(
    webhook_url: str,
    secret: str,
    event_type: str,
    payload: dict[str, Any],
    *,
    metadata: dict[str, Any] | None = None,
    max_attempts: int = 3,
) -> None:
    delay = 1.0
    for attempt in range(max_attempts):
        ok, err = deliver_webhook(
            webhook_url, secret, event_type, payload, metadata=metadata
        )
        if ok:
            return
        if attempt < max_attempts - 1:
            time.sleep(delay)
            delay *= 2
