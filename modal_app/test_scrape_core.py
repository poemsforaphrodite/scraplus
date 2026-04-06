import pytest

from scrape_core import clamp_timeout, should_escalate_to_playwright


def test_clamp_timeout():
    assert clamp_timeout(None) == 15
    assert clamp_timeout(1) == 3
    assert clamp_timeout(999) == 60


def test_escalate_empty():
    html = "<html><body><script>x</script></body></html>"
    assert should_escalate_to_playwright(html) is True


def test_escalate_rich_page():
    html = "<html><body><p>" + "word " * 50 + "</p></body></html>"
    assert should_escalate_to_playwright(html) is False
