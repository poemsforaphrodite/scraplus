import pytest

from monitor_lib import diff_exact, diff_semantic, diff_selector, compute_diff


def test_diff_exact_same():
    r = diff_exact("hello world", "hello world")
    assert r["changed"] is False
    assert r["status"] == "same"


def test_diff_exact_changed():
    r = diff_exact("hello", "hello world")
    assert r["changed"] is True
    assert r["status"] == "changed"
    assert "diff" in r


def test_diff_semantic_whitespace():
    r = diff_semantic("hello   world", "hello world")
    assert r["changed"] is False


def test_diff_semantic_real_change():
    r = diff_semantic("hello world", "goodbye world")
    assert r["changed"] is True


def test_diff_selector():
    old = "<html><body><h1>Old Title</h1><p>Same</p></body></html>"
    new = "<html><body><h1>New Title</h1><p>Same</p></body></html>"
    r = diff_selector(old, new, {"title": "h1", "body": "p"})
    assert r["changed"] is True
    assert r["fields"]["title"]["changed"] is True
    assert r["fields"]["body"]["changed"] is False


def test_compute_diff_default():
    r = compute_diff("a", "a")
    assert r["changed"] is False
