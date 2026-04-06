import pytest

from crawl_lib import CrawlRules, normalize_url, url_matches_rules


def test_normalize_strips_fragment():
    u = normalize_url("https://example.com/a#x", ignore_query=False)
    assert u == "https://example.com/a"


def test_normalize_strips_query_when_configured():
    u = normalize_url("https://example.com/a?q=1", ignore_query=True)
    assert u == "https://example.com/a"


def test_url_matches_child_path_default():
    seed = "https://example.com/blog/"
    rules = CrawlRules.from_dict({"limit": 10}, seed)
    h, p = "example.com", "/blog/"
    assert url_matches_rules(
        "https://example.com/blog/post-1", rules, h, p
    )
    assert not url_matches_rules(
        "https://example.com/news/", rules, h, p
    )


def test_exclude_path_regex():
    seed = "https://example.com/"
    rules = CrawlRules.from_dict(
        {"limit": 10, "exclude_paths": [r"/admin"]}, seed
    )
    h, p = "example.com", "/"
    assert not url_matches_rules("https://example.com/admin", rules, h, p)


def test_max_depth_none_allows_any_depth_flag():
    seed = "https://example.com/"
    rules = CrawlRules.from_dict({"limit": 10, "max_discovery_depth": 0}, seed)
    assert rules.max_discovery_depth == 0
