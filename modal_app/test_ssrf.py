import pytest

from ssrf import SsrfError, assert_public_http_url


def test_public_ok():
    assert "example.com" in assert_public_http_url("https://example.com/path")


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://localhost/",
        "http://192.168.1.1/",
        "file:///etc/passwd",
    ],
)
def test_blocked(url):
    with pytest.raises(SsrfError):
        assert_public_http_url(url)
