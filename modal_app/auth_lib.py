"""API key generation and validation helpers."""

from __future__ import annotations

import hashlib
import secrets


KEY_PREFIX = "sk_live_"
KEY_BYTES = 24


def generate_api_key() -> tuple[str, str]:
    """Returns (raw_key, key_hash)."""
    raw = f"{KEY_PREFIX}{secrets.token_hex(KEY_BYTES)}"
    return raw, hash_key(raw)


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def mask_key(raw: str) -> str:
    if len(raw) < 16:
        return "***"
    return raw[:12] + "..." + raw[-4:]


def validate_key_format(raw: str) -> bool:
    return raw.startswith(KEY_PREFIX) and len(raw) == len(KEY_PREFIX) + KEY_BYTES * 2
