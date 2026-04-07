import pytest

from auth_lib import generate_api_key, hash_key, mask_key, validate_key_format


def test_generate_key_format():
    raw, h = generate_api_key()
    assert raw.startswith("sk_live_")
    assert len(h) == 64


def test_hash_key_deterministic():
    assert hash_key("sk_live_abc") == hash_key("sk_live_abc")


def test_mask_key():
    raw, _ = generate_api_key()
    masked = mask_key(raw)
    assert masked.startswith("sk_live_")
    assert "..." in masked
    assert len(masked) < len(raw)


def test_validate_key_format():
    raw, _ = generate_api_key()
    assert validate_key_format(raw)
    assert not validate_key_format("bad_key")
    assert not validate_key_format("sk_live_short")
