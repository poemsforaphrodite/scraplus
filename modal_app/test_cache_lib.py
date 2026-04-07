import time

import pytest

from cache_lib import cache_get, cache_key, cache_put


def test_cache_key_deterministic():
    k1 = cache_key("https://example.com", {"mode": "auto"})
    k2 = cache_key("https://example.com", {"mode": "auto"})
    assert k1 == k2
    assert len(k1) == 64


def test_cache_key_differs_by_url():
    k1 = cache_key("https://a.com", {"mode": "auto"})
    k2 = cache_key("https://b.com", {"mode": "auto"})
    assert k1 != k2


def test_cache_key_differs_by_parts():
    k1 = cache_key("https://example.com", {"mode": "auto"})
    k2 = cache_key("https://example.com", {"mode": "js"})
    assert k1 != k2


def test_cache_put_get():
    store: dict = {}
    key = "test-key"
    data = {"url": "https://example.com", "content": {"text": "hello"}}

    cache_put(lambda k, v: store.__setitem__(k, v), key, data)
    assert key in store

    result = cache_get(lambda k: store[k], key, max_age_ms=60_000, min_age_ms=None)
    assert result == data


def test_cache_get_expired():
    store: dict = {}
    key = "test-key"
    data = {"url": "https://example.com"}

    store[key] = {"stored_at": time.time() - 120, "data": data}

    result = cache_get(lambda k: store[k], key, max_age_ms=60_000, min_age_ms=None)
    assert result is None


def test_cache_get_too_fresh():
    store: dict = {}
    key = "test-key"
    data = {"url": "https://example.com"}

    store[key] = {"stored_at": time.time(), "data": data}

    result = cache_get(lambda k: store[k], key, max_age_ms=None, min_age_ms=30_000)
    assert result is None


def test_cache_get_missing_key():
    result = cache_get(lambda k: (_ for _ in ()).throw(KeyError(k)), "nope", max_age_ms=60_000, min_age_ms=None)
    assert result is None
