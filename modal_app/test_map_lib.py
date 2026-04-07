import pytest

from map_lib import _host_matches


def test_host_exact_match():
    assert _host_matches("https://example.com/page", "example.com", include_subdomains=False)


def test_host_subdomain_allowed():
    assert _host_matches("https://blog.example.com/page", "example.com", include_subdomains=True)


def test_host_subdomain_rejected():
    assert not _host_matches("https://blog.example.com/page", "example.com", include_subdomains=False)


def test_host_different_domain():
    assert not _host_matches("https://other.com/page", "example.com", include_subdomains=True)
