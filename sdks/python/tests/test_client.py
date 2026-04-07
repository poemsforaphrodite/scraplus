"""Basic unit tests for the Scraplus Python SDK client."""

import pytest

from scraplus.client import Scraplus


def test_client_init():
    client = Scraplus(api_key="sk_live_test", base_url="https://api.test")
    assert client.base_url == "https://api.test"
    assert "Bearer sk_live_test" in client._client.headers["authorization"]
    client.close()


def test_client_context_manager():
    with Scraplus(api_key="sk_live_test") as client:
        assert client.base_url == "http://localhost:3000"


def test_client_strips_trailing_slash():
    client = Scraplus(api_key="k", base_url="https://api.test/")
    assert client.base_url == "https://api.test"
    client.close()
